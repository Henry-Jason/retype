// Levels: XP from every galley, no top level.
//
// Typing earns XP steadily; bonuses reward the things Corratype cares about (accuracy first,
// then speed, bests and showing up). The numbers are deliberately round so they're easy to
// explain on the Stats page.

export const XP_RULES = {
  perWord: 1,          // per correctly typed word-equivalent (5 correct keys)
  accuracy: [[100, 0.5], [98, 0.25], [95, 0.1]], // share of typing XP added at or above each accuracy
  speedPer: 10,        // +1 XP per 10 wpm...
  speedCap: 200,       // ...counted up to 200 wpm
  perfect: 25,         // no mistakes and no fixes, 10+ words
  best: 50,            // a new personal best
  rankUp: 100,         // moving up a rank
  firstOfDay: 20,      // the first galley of the day...
  streakStep: 5,       // ...plus this for each day of streak beyond the first, up to a week
  daily: 30,           // the first attempt at the daily galley
  minWords: 10         // bonuses need a galley of at least this many words or lines
};

/**
 * XP for one finished galley, with its breakdown for the finish screen.
 * ctx: { isBest, rankUp, firstOfDay, streak, dailyFirst }
 */
export function xpFor(result, ctx = {}) {
  const R = XP_RULES, parts = [];
  const correct = Math.round((result.keyCount || 0) * (result.acc || 0) / 100);
  const typing = Math.floor(correct / 5) * R.perWord;
  if (typing > 0) parts.push(["typing", typing]);
  const big = (result.wordsDone || 0) >= R.minWords;
  if (big) {
    const step = R.accuracy.find(([min]) => result.acc >= min);
    if (step) parts.push(["accuracy", Math.round(typing * step[1])]);
    if (result.mode !== "flow" && result.kind !== "practice") {
      const speed = Math.floor(Math.min(result.wpm || 0, R.speedCap) / R.speedPer);
      if (speed > 0) parts.push(["speed", speed]);
    }
    if (result.clean) parts.push(["perfect", R.perfect]);
    if (ctx.isBest) parts.push(["personal best", R.best]);
    if (ctx.rankUp) parts.push(["rank up", R.rankUp]);
    if (ctx.dailyFirst) parts.push(["daily", R.daily]);
  }
  if (ctx.firstOfDay && (result.wordsDone || 0) >= 5) {
    parts.push(["first of the day", R.firstOfDay + R.streakStep * Math.min(Math.max((ctx.streak || 1) - 1, 0), 6)]);
  }
  const filtered = parts.filter(([, n]) => n > 0);
  return { total: filtered.reduce((s, [, n]) => s + n, 0), parts: filtered };
}

/** XP needed to go from level n to n + 1: 100, then 20 more each level. */
export const xpToNext = (n) => 100 + 20 * n;
/** Total XP needed to reach level n. */
export const xpForLevel = (n) => 100 * n + 10 * n * (n - 1);

export function levelFrom(xp) {
  xp = Math.max(0, Math.floor(xp || 0));
  // solve 10n² + 90n − xp = 0 for a starting guess, then settle exactly
  let n = Math.max(0, Math.floor((-90 + Math.sqrt(8100 + 40 * xp)) / 20));
  while (xpForLevel(n + 1) <= xp) n++;
  while (n > 0 && xpForLevel(n) > xp) n--;
  const into = xp - xpForLevel(n), need = xpToNext(n);
  return { level: n, xp, into, need, progress: into / need };
}

/** Galleys from before levels existed: roughly one XP per correct word typed. */
export const legacyXp = (totals) => Math.round(((totals && totals.keys) || 0) / 5);
