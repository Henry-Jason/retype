// Personal progress: score, personal bests, the daily streak and the long-term weak-word profile.
// Everything here is pure: it takes plain data and returns plain data, so it can be tested and,
// later, recomputed on a server from the same stored results.

/* ---------- score and ranks ---------- */

/** One number that weighs accuracy heavily: 100 wpm at 90% scores 81, 80 wpm at 100% scores 80. */
export const score = (wpm, acc) => wpm * (acc / 100) ** 2;

/** Quotes are grouped by length: up to 20 words is short, up to 45 medium, longer is long. */
export const quoteBucket = (n) => (n <= 20 ? "short" : n <= 45 ? "medium" : "long");

// Ranks now come from total PP (see pp.js); these are re-exported for the rest of the app.
export { RANKS, rankFrom, countsForPp as isRanked } from "./pp.js";

/* ---------- personal bests ---------- */

/** Galleys are compared only with the same kind of galley. */
export function modeKey(r) {
  if (r.kind === "code") return `code:${r.snippet}`;
  if (r.kind === "quote") return `quote:${quoteBucket(r.length || 0)}`;
  if (r.kind !== "normal") return null;
  // survival: one best per number of lives, with regen and the speed floor kept apart too
  if (r.mode === "survival") {
    const v = r.surv || {};
    return ["survival", `${v.lives || 3}l`, v.regen ? "regen" : "", v.floor ? `floor${v.floor}` : "", r.punct ? "punct" : "", r.nums ? "nums" : ""].filter(Boolean).join(" ");
  }
  const len = r.mode === "time" ? `${r.length}s` : r.mode === "words" ? `${r.length}w` : r.mode;
  return [r.mode === "time" || r.mode === "words" ? len : r.mode, r.list, r.punct ? "punct" : "", r.nums ? "nums" : "", r.sudden ? "sudden" : ""].filter(Boolean).join(" ");
}

/** Best per mode is the highest score; ties go to the faster run. Returns the updated table and what changed. */
export function updateBests(bests, r) {
  const key = modeKey(r);
  // a best needs a real galley behind it: 10 words at least (a whole script in code mode,
  // a whole quote of 5 words or more in quote mode)
  const enough = r.kind === "code" ? true : r.kind === "quote" ? r.wordsDone >= r.length && r.length >= 5 : r.wordsDone >= 10;
  if (!key || r.mode === "flow" || !enough) return { bests, key, isBest: false, previous: null };
  const prev = bests[key] || null;
  if (r.mode === "survival") {
    // the furthest run wins; between runs of the same length, the better score
    const far = prev?.words ?? -1;
    const better = !prev || r.wordsDone > far || (r.wordsDone === far && r.score > prev.score + 1e-9);
    if (!better) return { bests, key, isBest: false, previous: prev };
    return { bests: { ...bests, [key]: { score: r.score, wpm: r.wpm, acc: r.acc, at: r.at, id: r.id, words: r.wordsDone } }, key, isBest: true, previous: prev };
  }
  const better = !prev || r.score > prev.score + 1e-9 || (Math.abs(r.score - prev.score) < 1e-9 && r.wpm > prev.wpm);
  if (!better) return { bests, key, isBest: false, previous: prev };
  return {
    bests: { ...bests, [key]: { score: r.score, wpm: r.wpm, acc: r.acc, at: r.at, id: r.id } },
    key, isBest: true, previous: prev
  };
}

/* ---------- the daily streak ---------- */

export const dayKey = (t) => {
  const d = new Date(t), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const shift = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n, 12).getTime());
};

/**
 * Any finished galley counts for its day. One missed day is forgiven, as long as there wasn't
 * another forgiven day in the 7 days before it, so a single busy day doesn't wipe out a streak.
 * Today not being played yet never breaks anything: the day isn't over.
 * days: day keys with at least one finished galley. Returns { count, alive, graceLeft }.
 */
export function streak(days, today) {
  const set = new Set(days);
  const yesterday = shift(today, -1);
  let d = set.has(today) ? today : yesterday;
  let count = 0, lastMiss = null, recentMiss = null;
  for (let i = 0; i < 3660; i++) {
    if (set.has(d)) { count++; d = shift(d, -1); continue; }
    const before = shift(d, -1);
    const spaced = lastMiss == null || daysBetween(d, lastMiss) >= 7;
    // a gap of exactly one day, between played days (or yesterday, with today still to come)
    const bridges = set.has(before) && (count > 0 || d === yesterday);
    if (bridges && spaced) {
      if (recentMiss == null) recentMiss = d;
      lastMiss = d; d = before; continue;
    }
    break;
  }
  const graceLeft = recentMiss == null || daysBetween(today, recentMiss) >= 7;
  return { count, alive: count > 0, graceLeft };
}
function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round(Math.abs(t(a) - t(b)) / 86400000);
}

/* ---------- the weak-word profile ---------- */

/**
 * Each word keeps a "trouble" value that moves towards how badly it went this time
 * (errors per appearance plus how much slower than usual it was typed). A clean, quick
 * appearance pulls it back down, so words you've fixed drop off the list on their own.
 */
export const WEAK_RATE = 0.4;
export function updateWeak(profile, words, at) {
  const next = { ...profile };
  for (const w of words) {
    const now = w.errs / w.occ + (w.slow || 0);
    const old = next[w.word];
    // several appearances in one galley count as more evidence, up to three
    const rate = 1 - (1 - WEAK_RATE) ** Math.min(w.occ, 3);
    const trouble = old ? old.trouble + (now - old.trouble) * rate : now;
    next[w.word] = { trouble: Math.max(0, Math.min(trouble, 5)), seen: (old ? old.seen : 0) + w.occ, last: at };
  }
  return next;
}
/** The words that need the most work, most troublesome first. */
export function topWeak(profile, n = 10, min = 0.25) {
  return Object.entries(profile)
    .filter(([, v]) => v.trouble >= min)
    .sort((a, b) => b[1].trouble - a[1].trouble)
    .slice(0, n)
    .map(([word, v]) => ({ word, ...v }));
}

/* ---------- pace against your best ---------- */

/**
 * Whether a galley in progress is on course to beat your best: "ahead", "behind" or "even"
 * (within 2% either way), or null with no best yet or too little typed to tell (under 3 seconds
 * or 5 words). The live score uses the same formula as the finished one.
 */
export function paceVsBest({ wpm, acc, best, secs, words }) {
  if (best == null || !(best > 0) || secs < 3 || words < 5) return null;
  const now = score(wpm, acc);
  if (now > best * 1.02) return "ahead";
  if (now < best * 0.98) return "behind";
  return "even";
}
