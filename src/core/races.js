// Your record in races (friend rooms and quick races): played, won, podiums, the current and best
// winning run, and a count per year for the Annual. Kept in the browser and the account, merged by
// taking the larger of each number. Pure.

export const emptyRaces = () => ({ played: 0, wins: 0, podiums: 0, streak: 0, best: 0, years: {} });

/**
 * One finished race. place: 1 for first; of: how many raced (ghosts included); upset: won without
 * the fastest wpm. Returns { races, earned } with headline ids earned (see core/feats.js).
 */
export function recordRace(races = emptyRaces(), { place, of, upset = false }, year, held = {}) {
  const r = { ...emptyRaces(), ...races, years: { ...(races.years || {}) } };
  const won = place === 1 && of > 1;
  r.played++;
  if (won) r.wins++;
  if (place <= 3 && of >= 3) r.podiums++;
  r.streak = won ? r.streak + 1 : 0;
  r.best = Math.max(r.best, r.streak);
  const y = r.years[year] || { played: 0, wins: 0 };
  r.years[year] = { played: y.played + 1, wins: y.wins + (won ? 1 : 0) };
  const earned = [];
  if (won && !held.raceWin) earned.push({ id: "raceWin" });
  if (r.streak >= 3 && !held.raceWin3) earned.push({ id: "raceWin3" });
  if (won && upset && !held.raceUpset) earned.push({ id: "raceUpset" });
  if (r.played >= 25 && !held.races25) earned.push({ id: "races25" });
  return { races: r, earned };
}

/** This browser's record and the account's: the larger of each. */
export function mergeRaces(a, b) {
  const x = { ...emptyRaces(), ...(a || {}) }, y = { ...emptyRaces(), ...(b || {}) };
  const years = { ...x.years };
  for (const [k, v] of Object.entries(y.years || {})) years[k] = { played: Math.max(years[k]?.played || 0, v.played || 0), wins: Math.max(years[k]?.wins || 0, v.wins || 0) };
  return { played: Math.max(x.played, y.played), wins: Math.max(x.wins, y.wins), podiums: Math.max(x.podiums, y.podiums), streak: Math.max(x.streak, y.streak), best: Math.max(x.best, y.best), years };
}
