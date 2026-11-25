// The stored shape of a finished galley. It carries enough to show history and, later, to
// re-score a run on a server from its keystroke log (so leaderboard scores can be checked).
import { score, dayKey } from "./progress.js";

export const RESULT_VERSION = 1;

/** Pack the keystroke log: [word, pos, typedChar, ok, ms, flags]. flags: 1 = space/line end, 2 = backspace, 4 = a survival life lost to the speed floor. */
export function packKeys(keys) {
  return keys.map((k) => k.bs || k.life
    ? [-1, -1, "", 0, Math.round((k.at ?? 0) * 1000), k.life ? 4 : 2]
    : [k.w, k.pos, k.ch, k.ok ? 1 : 0, Math.round(k.at * 1000), k.space ? 1 : 0]);
}

export function buildResult({ id, userId, at, session, stats, meta }) {
  return {
    id, v: RESULT_VERSION, userId, at, day: dayKey(at),
    kind: meta.kind,                 // normal | mix | practice | code
    mode: meta.mode,                 // words | time | flow | survival | code | quote | practice
    length: meta.length ?? null,     // word count or seconds
    list: meta.list ?? null, punct: !!meta.punct, nums: !!meta.nums, sudden: !!meta.sudden,
    snippet: meta.snippet ?? null, seed: meta.seed ?? null,
    ...(meta.surv ? { surv: meta.surv } : {}), // survival: { lives, regen, floor, left }
    ...(meta.lend === false ? { lend: false } : {}), // not to be raced as a quick-race ghost (core/racers.js)
    wpm: stats.wpm, raw: stats.raw, acc: stats.acc, score: score(stats.wpm, stats.acc),
    errors: stats.errors, fixes: stats.corrections, keyCount: stats.keys, secs: stats.secs,
    bestStreak: stats.best, wordsDone: meta.wordsDone, clean: stats.errors === 0 && stats.corrections === 0,
    xp: null,                        // filled in by applyResult
    targets: session.targets.slice(0, Math.max(meta.wordsDone, 1) + 1),
    keys: packKeys(session.keys)
  };
}
