// The decisions behind the PP board, kept free of Firebase so they can be tested directly.
import { verifyForBoard } from "./shared/core/verify.js";
import { ppFor, playOf, mergeTop, totalPp, countsForPp } from "./shared/core/pp.js";

const HOUR = 60 * 60 * 1000;

/**
 * Score one saved galley for the PP board from its keystrokes. Returns { ok, play } or
 * { ok: false, reason }. Unlike the daily, age doesn't matter: a galley is as checkable a
 * year later as on the day, so galleys typed as a guest and uploaded at sign-in count too.
 */
export function ppPlay({ uid, rid, result, now }) {
  if (result.userId !== uid || result.id !== rid) return { ok: false, reason: "result filed under the wrong account" };
  if (!countsForPp(result)) return { ok: false, reason: "doesn't earn PP", quiet: true };
  if (!(result.at < now + HOUR)) return { ok: false, reason: "from the future" };
  const v = verifyForBoard(result);
  if (!v.ok) return v;
  const p = ppFor(result, { wpm: v.wpm, acc: v.acc, words: wordsReached(result) });
  if (!p.ok) return p;
  if (!(p.pp > 0)) return { ok: false, reason: "no PP", quiet: true };
  return { ok: true, play: playOf({ ...result, wpm: v.wpm, acc: v.acc }, p.pp) };
}

/** How many words the keystroke log actually reaches (so wordsDone can't be inflated). */
function wordsReached(result) {
  let keys = result.keys;
  if (typeof keys === "string") { try { keys = JSON.parse(keys); } catch { return 0; } }
  let last = -1;
  for (const k of keys) if (k[5] !== 2 && k[0] > last) last = k[0];
  // the last word reached may be unfinished; a words galley ends on its last word, a time galley mid-word
  return last + 1;
}

/** The board entry after adding plays. cur: the existing entry or null. */
export function nextEntry({ uid, cur, plays, name, now, backfilled = false }) {
  const top = mergeTop(cur?.plays || [], plays);
  return {
    uid, name: name || cur?.name || "Anonymous typist",
    pp: Math.round(totalPp(top) * 100) / 100,
    best: top.length ? top[0].pp : 0,
    count: top.length,
    plays: top,
    updated: now,
    backfilled: backfilled || !!cur?.backfilled
  };
}

