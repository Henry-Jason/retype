// The Corratype Annual: a front page about your year at the desk. Pure: buildAnnual takes the galleys
// and the progress record and returns the page's facts. Uses the weekly edition's word-of-the-week rule.
import { wordOfWeek } from "./edition.js";
import { headline } from "./feats.js";
import { sortFor } from "./typecase.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * results: galleys (any order); year: e.g. 2026; races, feats: from the progress state; rank: rankFrom(top).
 * Returns { year, quiet, lead, dek, stats, bestDay, bestMonth, best, fastest, survival, word, races, feats, sorts, rank }.
 */
export function buildAnnual(results, year, { races = null, feats = {}, rank = null, name = "Local typist" } = {}) {
  const mine = results.filter((r) => new Date(r.at).getFullYear() === year);
  const keys = mine.reduce((s, r) => s + (r.keyCount || 0), 0);
  const stats = {
    galleys: mine.length,
    secs: mine.reduce((s, r) => s + (r.secs || 0), 0),
    words: mine.reduce((s, r) => s + (r.wordsDone || 0), 0),
    keys,
    acc: keys ? mine.reduce((s, r) => s + (r.acc || 0) * (r.keyCount || 0), 0) / keys : null,
    perfect: mine.filter((r) => r.clean && (r.wordsDone || 0) >= 10).length,
    days: new Set(mine.map((r) => r.day)).size
  };
  const byDay = new Map(), byMonth = new Map();
  for (const r of mine) {
    byDay.set(r.day, (byDay.get(r.day) || 0) + 1);
    const m = new Date(r.at).getMonth(); byMonth.set(m, (byMonth.get(m) || 0) + 1);
  }
  const top = (m) => [...m.entries()].reduce((a, b) => (!a || b[1] > a[1] ? b : a), null);
  const d = top(byDay), mo = top(byMonth);
  const scored = mine.filter((r) => (r.mode === "words" || r.mode === "time") && (r.wordsDone || 0) >= 15 && r.kind !== "practice");
  const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const fastest = scored.length ? scored.reduce((a, b) => (b.wpm > a.wpm ? b : a)) : null;
  const surv = mine.filter((r) => r.mode === "survival");
  const survival = surv.length ? surv.reduce((a, b) => ((b.wordsDone || 0) > (a.wordsDone || 0) ? b : a)) : null;
  const earned = Object.entries(feats).filter(([, v]) => v?.at && new Date(v.at).getFullYear() === year).sort((a, b) => a[1].at - b[1].at).map(([id, v]) => headline(id, v));
  const sorts = mine.filter((r) => sortFor(r)).length;
  const rc = races?.years?.[year] || null;
  const who = name.toUpperCase();
  let lead, dek;
  if (!mine.length) { lead = `A quiet year for ${who}`; dek = "The presses are oiled and waiting."; }
  else if (stats.words >= 50000) { lead = `${who} types ${stats.words.toLocaleString("en-IE")} words in ${year}`; dek = "Roughly a novel, one galley at a time."; }
  else if (rc?.wins >= 10) { lead = `${who} wins ${rc.wins} races; rivals call for an inquiry`; dek = `${rc.played} raced in all.`; }
  else if (stats.perfect >= 20) { lead = `${stats.perfect} perfect galleys: proofreaders laid off`; dek = "Not a mark on any of them."; }
  else if (stats.days >= 100) { lead = `${who} at the desk ${stats.days} days of the year`; dek = "Turning up is most of it."; }
  else { lead = `${who} files ${stats.galleys} ${stats.galleys === 1 ? "galley" : "galleys"} in ${year}`; dek = `${stats.words.toLocaleString("en-IE")} words${stats.acc != null ? `, ${stats.acc.toFixed(1)}% accurate` : ""}.`; }
  return {
    year, quiet: !mine.length, lead, dek, stats,
    bestDay: d ? { day: d[0], galleys: d[1] } : null, bestMonth: mo ? { month: MONTHS[mo[0]], galleys: mo[1] } : null,
    best, fastest, survival, word: wordOfWeek(mine), races: rc, feats: earned, sorts, rank
  };
}

/** When the Annual is the year's news: December, and January for the year just gone. */
export const annualYear = (now = Date.now()) => { const d = new Date(now); return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); };
export const annualSeason = (now = Date.now()) => { const m = new Date(now).getMonth(); return m === 11 || m === 0; };
