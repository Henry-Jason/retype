// Ties the stored data to the progress rules. applyResult is pure (and tested); record() also saves.
import { updateBests, updateWeak, streak, dayKey } from "../core/progress.js";
import { ppFor, playOf, addPlay, totalPp, rankFrom, topFrom } from "../core/pp.js";
import { xpFor, levelFrom, legacyXp } from "../core/levels.js";
import { checkFeats, addFeats } from "../core/feats.js";

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const emptyState = () => ({
  profile: { id: uuid(), guest: true, created: Date.now() },
  bests: {}, weak: {}, days: [], bestStreak: 0, xp: 0, top: [], feats: {},
  totals: { galleys: 0, secs: 0, keys: 0, perfect: 0 },
  recent: []
});

export async function loadProgress(store) {
  const s = emptyState();
  const [profile, bests, weak, days, bestStreak, totals, recent, xp, stored, feats] = await Promise.all([
    store.get("profile"), store.get("bests"), store.get("weak"), store.get("days"),
    store.get("bestStreak"), store.get("totals"), store.recent(60), store.get("xp"), store.get("top"), store.get("feats")
  ]);
  if (profile) s.profile = profile; else await store.set("profile", s.profile);
  // galleys typed before PP existed earn it once, here
  let top = stored;
  if (!Array.isArray(top)) { top = topFrom(await store.all()); await store.set("top", top); }
  return {
    ...s,
    bests: bests || {}, weak: weak || {}, days: days || [], bestStreak: bestStreak || 0,
    totals: totals || s.totals, recent: recent || [],
    xp: xp ?? legacyXp(totals), top, feats: feats || {}
  };
}

/**
 * Fold a finished galley into the progress state.
 * words: the per-word breakdown from analyse() (feeds the weak-word profile).
 * Returns the new state and what changed, for the finish screen.
 */
export function applyResult(state, result, words, today = dayKey(result.at)) {
  const topBefore = state.top || [];
  const rankBefore = rankFrom(topBefore);
  const p = ppFor(result);
  const top = p.ok ? addPlay(topBefore, playOf(result, p.pp)) : topBefore;
  if (result.pp === undefined) result.pp = p.ok ? Math.round(p.pp * 100) / 100 : null;
  const recent = [result, ...state.recent].slice(0, 60);
  const best = updateBests(state.bests, result);
  // practice and code galleys still teach the profile; flow galleys too
  const weak = result.kind === "code" ? state.weak : updateWeak(state.weak, words, result.at);
  const days = state.days.includes(result.day) ? state.days : [...state.days, result.day].slice(-400);
  const st = streak(days, today);
  // XP is worked out once, here, and stored on the galley, so the account (which folds
  // the same galley later, without the recent list) adds exactly the same amount.
  const rankAfter = rankFrom(top);
  // reaching Copy boy (the first rank) is just a start, not a promotion
  const rankUp = !!rankAfter.rank && rankAfter.index > (rankBefore.rank ? rankBefore.index : 0);
  let xpParts = null;
  if (result.xp == null) {
    const x = xpFor(result, {
      isBest: best.isBest, rankUp, streak: st.count,
      firstOfDay: !state.days.includes(result.day),
      dailyFirst: result.kind === "daily" && !state.recent.some((r) => r.kind === "daily" && r.day === result.day)
    });
    result.xp = x.total; xpParts = x.parts;
  }
  const xpBefore = state.xp ?? legacyXp(state.totals), xpAfter = xpBefore + result.xp;
  const totals = {
    galleys: state.totals.galleys + 1,
    secs: state.totals.secs + result.secs,
    keys: state.totals.keys + result.keyCount,
    perfect: state.totals.perfect + (result.clean && result.wordsDone >= 10 ? 1 : 0)
  };
  const bestStreak = Math.max(state.bestStreak, st.count);
  // headlines: earned once, from this galley and where it leaves you
  const levelAfter = levelFrom(xpAfter);
  const earned = checkFeats(state.feats || {}, result, {
    totals, bestStreak, streak: st.count, level: levelAfter.level, rankIndex: rankAfter.rank ? rankAfter.index : -1,
    prevWeak: state.weak, weak, hour: new Date(result.at).getHours()
  });
  const feats = addFeats(state.feats || {}, earned, result.at);
  const next = { ...state, recent, bests: best.bests, weak, days, totals, bestStreak, xp: xpAfter, top, feats };
  return {
    state: next,
    change: {
      isBest: best.isBest, previous: best.previous, key: best.key,
      rankBefore, rankAfter,
      rankUp,
      pp: p.ok ? p.pp : null, ppBefore: totalPp(topBefore), ppAfter: totalPp(top), inTop: top.some((x) => x.id === result.id),
      streak: st,
      xp: result.xp, xpParts, levelBefore: levelFrom(xpBefore), levelAfter,
      feats: earned, featsBefore: state.feats || {}
    }
  };
}

export async function record(store, state, result, words) {
  const out = applyResult(state, result, words);
  const s = out.state;
  try {
    await store.addResult(result);
    await Promise.all([
      store.set("bests", s.bests), store.set("weak", s.weak), store.set("days", s.days),
      store.set("bestStreak", s.bestStreak), store.set("totals", s.totals), store.set("xp", s.xp), store.set("top", s.top), store.set("feats", s.feats)
    ]);
  } catch (e) {
    console.warn("Couldn't save this galley", e);
  }
  return out;
}
