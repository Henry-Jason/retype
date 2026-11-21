// The weekly edition: a front page about your week at the desk, from the galleys you typed.
// Weeks run Monday to Sunday, local time. Pure: buildEdition takes the galleys and returns the page's facts.
import { norm } from "./words.js";
import { headline } from "./feats.js";

const DAY = 86400000;
/** Monday 00:00 (local) of the week containing t, as a timestamp. */
export function weekStart(t) {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
/** A stable key for a week: its Monday, "2026-11-16". */
export const weekKey = (start) => { const d = new Date(start), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
/** The next Monday after a week starts (handles clock changes). */
export const weekEnd = (start) => weekStart(start + 8 * DAY);

/** The word you fumbled most in some galleys, and how many times. */
export function wordOfWeek(results) {
  const n = new Map();
  for (const r of results) {
    if (r.kind === "code" || !Array.isArray(r.keys)) continue;
    for (const k of r.keys) {
      if (!Array.isArray(k) || k[5] === 2 || k[5] === 4 || k[3]) continue;
      const w = r.targets?.[k[0]]; if (!w) continue;
      const key = norm(w); n.set(key, (n.get(key) || 0) + 1);
    }
  }
  let best = null;
  for (const [word, misses] of n) if (!best || misses > best.misses) best = { word, misses };
  return best && best.misses >= 2 ? best : null;
}

function summary(rs) {
  const keys = rs.reduce((s, r) => s + (r.keyCount || 0), 0);
  return {
    galleys: rs.length,
    secs: rs.reduce((s, r) => s + (r.secs || 0), 0),
    words: rs.reduce((s, r) => s + (r.wordsDone || 0), 0),
    acc: keys ? rs.reduce((s, r) => s + (r.acc || 0) * (r.keyCount || 0), 0) / keys : null,
    perfect: rs.filter((r) => r.clean && (r.wordsDone || 0) >= 10).length,
    days: new Set(rs.map((r) => r.day)).size
  };
}

/**
 * results: galleys (any order); start: the week's Monday; feats: held headlines; name: who to write about.
 * Returns { key, start, end, no, quiet, lead, dek, stats, prev, best, survival, word, feats }.
 */
export function buildEdition(results, start, { feats = {}, name = "Local typist", first = null } = {}) {
  const end = weekEnd(start), prevStart = weekStart(start - DAY);
  const mine = results.filter((r) => r.at >= start && r.at < end);
  const before = results.filter((r) => r.at >= prevStart && r.at < start);
  const stats = summary(mine), prev = before.length ? summary(before) : null;
  const scored = mine.filter((r) => (r.mode === "words" || r.mode === "time") && (r.wordsDone || 0) >= 15 && r.kind !== "practice");
  const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const surv = mine.filter((r) => r.mode === "survival");
  const survival = surv.length ? surv.reduce((a, b) => ((b.wordsDone || 0) > (a.wordsDone || 0) ? b : a)) : null;
  const word = wordOfWeek(mine);
  const earned = Object.entries(feats).filter(([, v]) => v?.at >= start && v.at < end).sort((a, b) => a[1].at - b[1].at).map(([id, v]) => headline(id, v));
  // the edition number counts weeks since your first galley
  const no = first ? Math.max(1, Math.round((start - weekStart(first)) / (7 * DAY)) + 1) : 1;
  const who = name.toUpperCase();
  let lead, dek;
  if (!mine.length) { lead = "Quiet week on the desk"; dek = "No galleys filed. The presses wait."; }
  else if (survival && (survival.wordsDone || 0) >= 150) { lead = `${who} survives ${survival.wordsDone} words`; dek = `Deep into the ${survival.wordsDone >= 350 ? "10K" : "5K"} region before the last life went.`; }
  else if (stats.perfect >= 3) { lead = `${stats.perfect} clean galleys: ${who} leaves proofreaders idle`; dek = "Not a mark on any of them."; }
  else if (best && best.acc >= 97) { lead = `${who} posts ${Math.round(best.wpm)} wpm at ${best.acc.toFixed(1)}%`; dek = "Speed without the mess."; }
  else if (prev && stats.acc != null && prev.acc != null && stats.acc - prev.acc >= 1) { lead = `Accuracy up ${(stats.acc - prev.acc).toFixed(1)} points as ${who} tightens up`; dek = `From ${prev.acc.toFixed(1)}% to ${stats.acc.toFixed(1)}%.`; }
  else if (stats.days >= 5) { lead = `${who} at the desk ${stats.days} days out of 7`; dek = "Turning up is most of it."; }
  else { lead = `${who} files ${stats.galleys} ${stats.galleys === 1 ? "galley" : "galleys"}`; dek = `${stats.words.toLocaleString("en-IE")} words, ${stats.acc != null ? stats.acc.toFixed(1) + "% accurate" : ""}.`; }
  return { key: weekKey(start), start, end, no, quiet: !mine.length, lead, dek, stats, prev, best, survival, word, feats: earned };
}
