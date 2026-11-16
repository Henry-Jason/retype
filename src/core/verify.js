// Checking a galley on the server before it goes on a leaderboard. Shared by the app's tests and
// the Cloud Function (functions/index.js), so both agree on exactly what counts.
//
// It works from the stored keystroke log and target words alone, never trusting the speed or
// accuracy the browser reported: every key is checked against the word it was typed into,
// each word is rebuilt from the last character typed at each position, and speed and accuracy
// are recomputed. It then compares them with what the browser claimed.
import { mulberry32 } from "./rng.js";
import { genWords } from "./words.js";
import { dailySeed, DAILY } from "./challenge.js";
import { score } from "./progress.js";

export const LIMITS = {
  maxWpm: 250,          // faster than any human on record over a full galley
  minGapMs: 12,         // keys closer together than this...
  maxFastShare: 0.2,    // ...on more than this share of keys looks scripted
  wpmTolerance: 0.02,   // claimed wpm may differ by 2% (or 1 wpm) from the recomputed one
  accTolerance: 0.2     // claimed accuracy may differ by 0.2 points
};

const fail = (reason) => ({ ok: false, reason });

/**
 * Recompute a galley from its log. keys: packed [word, pos, char, ok, ms, flags]
 * (flags 1 = space/line end, 2 = backspace), or the JSON string the cloud stores.
 */
export function rescore(result) {
  let keys = result.keys;
  if (typeof keys === "string") { try { keys = JSON.parse(keys); } catch { return fail("unreadable keystroke log"); } }
  const targets = result.targets;
  if (!Array.isArray(keys) || !Array.isArray(targets) || !keys.length || !targets.length) return fail("empty galley");

  const typed = targets.map(() => new Map()); // position → last character typed there
  const spaceAt = new Map();                   // word → length when its space was pressed (the last time)
  let total = 0, okKeys = 0, lastMs = 0, prevMs = null, fast = 0, gaps = 0;
  for (const k of keys) {
    if (!Array.isArray(k) || k.length !== 6) return fail("malformed key");
    const [w, pos, ch, ok, ms, flags] = k;
    if (!Number.isFinite(ms) || ms < 0 || ms + 1 < lastMs) return fail("keys out of order");
    lastMs = Math.max(lastMs, ms);
    if (flags === 2) continue; // a correction: costs nothing here, the miss it fixed already counted
    if (!Number.isInteger(w) || w < 0 || w >= targets.length || !Number.isInteger(pos) || pos < 0) return fail("key outside the galley");
    const tgt = targets[w];
    const expected = flags === 1 ? pos >= tgt.length : tgt[pos] === ch;
    if (!!ok !== expected) return fail("keystroke log doesn't match the words");
    total++; if (expected) okKeys++;
    if (flags === 1) spaceAt.set(w, pos); else typed[w].set(pos, ch);
    if (prevMs != null) { gaps++; if (ms - prevMs < LIMITS.minGapMs) fast++; }
    prevMs = ms;
  }
  if (!total) return fail("no keys");

  // A word counts if, the last time it was left, it read exactly right. The final word has no
  // space after it, and a words galley only ends once it's typed exactly.
  const last = Math.max(...keys.filter((k) => k[5] !== 2).map((k) => k[0]));
  let chars = 0;
  for (let w = 0; w <= last; w++) {
    const tgt = targets[w], len = spaceAt.has(w) ? spaceAt.get(w) : tgt.length;
    let right = len === tgt.length;
    for (let p = 0; right && p < tgt.length; p++) if (typed[w].get(p) !== tgt[p]) right = false;
    if (right) chars += tgt.length + (spaceAt.has(w) ? 1 : 0);
  }
  const secs = Math.max(Number(result.secs) || 0, lastMs / 1000);
  if (secs < 1) return fail("too short");
  const wpm = chars / 5 / (secs / 60), acc = (okKeys / total) * 100;
  return { ok: true, wpm, acc, score: score(wpm, acc), secs, keys: total, fastShare: gaps ? fast / gaps : 0 };
}

/** Is this result fit for a leaderboard? Returns the recomputed numbers, or why not. */
export function verifyForBoard(result) {
  const r = rescore(result);
  if (!r.ok) return r;
  if (result.keyCount != null && result.keyCount !== r.keys) return fail("key count doesn't match");
  if (Math.abs(r.wpm - result.wpm) > Math.max(1, r.wpm * LIMITS.wpmTolerance)) return fail("speed doesn't match the keystrokes");
  if (Math.abs(r.acc - result.acc) > LIMITS.accTolerance) return fail("accuracy doesn't match the keystrokes");
  if (r.wpm > LIMITS.maxWpm) return fail("faster than humanly plausible");
  if (r.fastShare > LIMITS.maxFastShare) return fail("keys too close together to be typed by hand");
  return r;
}

/** The daily galley: right settings, right words for that day, finished. */
export function verifyDaily(result) {
  if (result.kind !== "daily") return fail("not a daily galley");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.day || "")) return fail("no day");
  if (result.mode !== DAILY.mode || result.list !== DAILY.list || result.punct || result.nums || result.sudden) return fail("wrong settings for the daily");
  if (result.seed !== dailySeed(result.day)) return fail("not that day's words");
  const words = genWords(DAILY.length, { rand: mulberry32(dailySeed(result.day)), list: DAILY.list });
  const t = result.targets || [];
  if (!t.length || t.some((w, i) => w !== words[i])) return fail("not that day's words");
  if (result.wordsDone !== DAILY.length) return fail("not finished");
  return verifyForBoard({ ...result, targets: words });
}
