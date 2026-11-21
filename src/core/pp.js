// Performance points, after osu!. Every counted galley is worth some PP, from how hard its words
// were, how long it was, how fast it was typed and, above all, how accurately. Your total is
// your best galley, plus 95% of your second best, plus 95%² of your third, down your top 100,
// so it only climbs by setting new top plays. Ranks come from the total.
//
// Pure functions only. The server (functions/pp.js) scores each galley with this same file,
// working from the words actually typed rather than the settings the browser claims.
import W200 from "../data/words-200.js";
import W1K from "../data/words-1k.js";
import W10K from "../data/words-10k.js";

export const PP_RULES = {
  base: 100,          // 100 wpm, 100%, average top-1,000 words, 50 words long → 100 PP
  speedExp: 1.5,      // speed counts a little more than linearly
  accExp: 12,         // 98% keeps 78%, 95% keeps 54%, 90% keeps 28%
  minWords: 15,       // shorter galleys don't count
  lengthCap: 100,     // length bonus grows up to this many words
  weight: 0.95,       // each lower play counts 95% of the one above it
  top: 100,           // how many plays make up the total
  maxRepeat: 0.12,    // no single word may be more than 12% of a galley...
  minDistinct: 0.3    // ...and at least 30% of its words must be different
};

// Each rung is about 30% further than the last, so the early ranks come quickly and the top
// ones take years. The top, 11,000, is about the most anyone could hold: a top 100 of 250 wpm,
// 100%, 100-word galleys from the top 5,000.
export const RANKS = [
  { name: "Copy boy", min: 0 },
  { name: "Printer's devil", min: 100 },
  { name: "Typesetter", min: 250 },
  { name: "Compositor", min: 450 },
  { name: "Proofreader", min: 700 },
  { name: "Copy editor", min: 1000 },
  { name: "Sub-editor", min: 1400 },
  { name: "Chief sub-editor", min: 1900 },
  { name: "Editor", min: 2500 },
  { name: "Senior editor", min: 3300 },
  { name: "Managing editor", min: 4300 },
  { name: "Editor-in-chief", min: 5600 },
  { name: "Publisher", min: 7000 },
  { name: "Press baron", min: 8700 },
  { name: "Fourth estate", min: 11000 }
];

/** Ordinary galleys count: plain, mixed, the daily and challenge links, by words or time. */
export const countsForPp = (r) =>
  ["normal", "mix", "daily", "challenge"].includes(r.kind) && (r.mode === "words" || r.mode === "time") && !r.sudden && (r.wordsDone || 0) >= PP_RULES.minWords;

/* ---------- how hard the words were ---------- */

// Frequency rank of every word Retype can give you. The 10k list is in frequency order and starts
// with the whole 5k list, so a top-5,000 word has the same rank it always had; the odd hand-picked
// word that isn't in it counts as rare.
const RANK = new Map(W10K.map((w, i) => [w, i]));
for (const w of [...W1K, ...W200]) if (!(RANK.get(w) < 5000)) RANK.set(w, 5000); // as before 10k existed
// Calibrated so the average word of each list gives top 200 ≈ 0.85, top 1,000 ≈ 1.0, top 5,000 ≈ 1.2
// (and, from the same curve, top 10,000 ≈ 1.28).
const wordDiff = (rank) => 0.267 + 0.0858 * Math.log2(rank + 2);
const NUMBER_DIFF = 1.1;

/**
 * Difficulty of a run of words, about 0.85 to 1.2, or { ok: false } if they aren't Retype's
 * words or are too repetitive to count (the server rejects such galleys).
 */
export function difficulty(words) {
  if (!words.length) return { ok: false, reason: "no words" };
  let sum = 0, chars = 0, special = 0;
  const counts = new Map();
  for (const raw of words) {
    const bare = raw.replace(/[.,?!;:'"]+$/g, "");
    const lower = bare.toLowerCase();
    let d;
    if (/^\d+$/.test(bare)) d = NUMBER_DIFF;
    else if (RANK.has(lower)) d = wordDiff(RANK.get(lower));
    else return { ok: false, reason: `"${raw}" isn't one of Retype's words` };
    sum += d;
    chars += raw.length;
    special += raw.length - (raw.match(/[a-z]/g) || []).length; // capitals, punctuation, digits
    counts.set(lower, (counts.get(lower) || 0) + 1);
  }
  const n = words.length;
  if (n >= 20) {
    if (Math.max(...counts.values()) / n > PP_RULES.maxRepeat) return { ok: false, reason: "one word repeated too often" };
    if (counts.size / n < PP_RULES.minDistinct) return { ok: false, reason: "too few different words" };
  }
  return { ok: true, value: (sum / n) * (1 + 1.5 * (special / chars)) };
}

/* ---------- one galley ---------- */

export const lengthFactor = (n) => 0.8 + 0.4 * Math.min(n, PP_RULES.lengthCap) / PP_RULES.lengthCap;

/** PP from the parts, for the finish screen and the Stats explainer. */
export function ppFrom({ wpm, acc, diff, words }) {
  const R = PP_RULES;
  return R.base * Math.max(0, wpm / 100) ** R.speedExp * Math.max(0, Math.min(acc, 100) / 100) ** R.accExp * diff * lengthFactor(words);
}

/**
 * PP for a finished galley, or { ok: false } if it doesn't count. The words are the ones
 * finished (the first wordsDone targets), so the server scores exactly what was typed.
 * over: recomputed { wpm, acc, words } from the server, used in place of the browser's.
 */
export function ppFor(result, over = null) {
  if (!countsForPp(result)) return { ok: false, reason: "this kind of galley doesn't earn PP" };
  const words = Math.min(result.wordsDone, over?.words ?? Infinity);
  const d = difficulty((result.targets || []).slice(0, words));
  if (!d.ok) return d;
  const wpm = over ? over.wpm : result.wpm, acc = over ? over.acc : result.acc;
  return { ok: true, pp: ppFrom({ wpm, acc, diff: d.value, words }), diff: d.value, words };
}

/* ---------- the total ---------- */

/** What's kept of each counted galley, best first. */
export const playOf = (r, pp) => ({
  id: r.id, pp: Math.round(pp * 100) / 100, at: r.at, wpm: Math.round(r.wpm * 10) / 10, acc: Math.round(r.acc * 100) / 100,
  kind: r.kind, mode: r.mode, length: r.length ?? null, list: r.list ?? null
});

/** Add a play to a top list (one per galley), best first, cut to PP_RULES.top. */
export function addPlay(top = [], play) {
  if (!play || !(play.pp > 0)) return top;
  return mergeTop(top, [play]);
}
export function mergeTop(a = [], b = []) {
  const byId = new Map();
  for (const p of [...a, ...b]) if (p && p.id && (!byId.has(p.id) || p.pp > byId.get(p.id).pp)) byId.set(p.id, p);
  return [...byId.values()].sort((x, y) => y.pp - x.pp || x.at - y.at).slice(0, PP_RULES.top);
}

/** The weighted total: best + 0.95 × second + 0.95² × third... */
export const totalPp = (top = []) => top.reduce((s, p, i) => s + p.pp * PP_RULES.weight ** i, 0);

/** Top plays from a pile of stored galleys (for browsers that had galleys before PP existed). */
export function topFrom(results) {
  let top = [];
  for (const r of results) {
    const p = ppFor(r);
    if (p.ok) top = addPlay(top, playOf(r, p.pp));
  }
  return top;
}

/* ---------- ranks and grades ---------- */

/** Rank from total PP. Unranked until the first galley that earns PP. */
export function rankFrom(top = []) {
  const pp = totalPp(top);
  if (!top.length) return { rank: null, pp: 0, needed: 1 };
  let i = 0;
  while (i + 1 < RANKS.length && pp >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1] || null;
  const progress = next ? (pp - RANKS[i].min) / (next.min - RANKS[i].min) : 1;
  return { rank: RANKS[i], index: i, next, pp, progress: Math.max(0, Math.min(1, progress)) };
}

export const GRADES = [["SS", 100], ["S", 98], ["A", 95], ["B", 90], ["C", 85], ["D", 0]];
/** osu-style letter for a galley's accuracy. */
export const grade = (acc) => GRADES.find(([, min]) => acc >= min - 1e-9)[0];
