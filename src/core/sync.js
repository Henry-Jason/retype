// Syncing progress with an account. Pure functions only: the Firestore calls live in
// src/storage/cloud.js and use these to decide what to write.
//
// The account keeps one document (bests, weak words, streak days, totals) plus one document
// per finished galley. Each galley is folded into the account document inside a transaction,
// so two devices finishing galleys at the same moment can't overwrite each other's totals.
import { applyResult } from "../storage/progress-service.js";
import { legacyXp } from "./levels.js";
import { mergeTop } from "./pp.js";
import { mergeFeats } from "./feats.js";

export const DOC_VERSION = 1;
export const WEAK_CAP = 1500;
export const RECENT = 60;
export const FOLDED_CAP = 300;

export const emptyDoc = () => ({
  v: DOC_VERSION, bests: {}, weak: {}, days: [], bestStreak: 0, xp: 0, top: [], feats: {},
  totals: { galleys: 0, secs: 0, keys: 0, perfect: 0 },
  folded: []
});

/** Only the fields the account document holds, with defaults for anything missing. */
export function docFrom(x) {
  const e = emptyDoc();
  if (!x) return e;
  return {
    v: DOC_VERSION,
    bests: x.bests || e.bests, weak: x.weak || e.weak, days: x.days || e.days,
    bestStreak: x.bestStreak || 0, totals: { ...e.totals, ...(x.totals || {}) },
    xp: x.xp ?? legacyXp(x.totals),
    top: Array.isArray(x.top) ? x.top : [],
    feats: x.feats && typeof x.feats === "object" ? x.feats : {},
    folded: Array.isArray(x.folded) ? x.folded : []
  };
}

/** Keep the weak-word profile bounded: drop the words seen least recently. */
export function capWeak(weak, cap = WEAK_CAP) {
  const entries = Object.entries(weak);
  if (entries.length <= cap) return weak;
  return Object.fromEntries(entries.sort((a, b) => b[1].last - a[1].last).slice(0, cap));
}

/**
 * Fold one finished galley into the account document.
 * words: the per-word breakdown from analyse(); null when it isn't available (galleys
 * uploaded later from a guest session), in which case the weak profile is left alone.
 */
// Folding is idempotent: the document remembers the last FOLDED_CAP galley ids, so a retried
// upload (after a dropped connection, say) never counts the same galley twice.
export function foldResult(doc, result, words, today) {
  const d = docFrom(doc);
  if (d.folded.includes(result.id)) return d;
  const out = applyResult({ ...d, recent: [] }, result, words || [], today).state;
  return { ...docFrom(out), weak: capWeak(words ? out.weak : d.weak), folded: [...d.folded, result.id].slice(-FOLDED_CAP) };
}

/** Per word, the entry updated most recently wins. */
export function mergeWeak(a = {}, b = {}) {
  const out = { ...a };
  for (const [w, e] of Object.entries(b)) {
    const o = out[w];
    if (!o || e.last > o.last || (e.last === o.last && e.seen > o.seen)) out[w] = e;
  }
  return capWeak(out);
}

/** Newest first, one copy of each galley. */
export function mergeRecent(a = [], b = [], n = RECENT) {
  const byId = new Map();
  for (const r of [...a, ...b]) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => y.at - x.at).slice(0, n);
}

/**
 * Signing in on a browser that has guest galleys the account hasn't seen ("pending").
 * Each pending galley is folded into the account document in time order; the weak-word
 * profiles are merged, since the guest's was built from those same galleys.
 */
export function mergeGuest(doc, local, pending, today) {
  let d = docFrom(doc);
  for (const r of [...pending].sort((a, b) => a.at - b.at)) d = foldResult(d, r, null, today);
  return {
    ...d,
    weak: mergeWeak(d.weak, local.weak),
    // the browser's top plays may include galleys from before PP (or before the account had them)
    top: mergeTop(d.top, local.top),
    feats: mergeFeats(d.feats, local.feats),
    bestStreak: Math.max(d.bestStreak, local.bestStreak || 0)
  };
}

/* ---------- the cloud copy of a galley ---------- */

// Firestore can't hold arrays inside arrays, so the packed keystroke log travels as a string.
export function toCloud(result, uid) {
  return { ...result, userId: uid, keys: JSON.stringify(result.keys) };
}
export function fromCloud(doc) {
  let keys = [];
  try { keys = typeof doc.keys === "string" ? JSON.parse(doc.keys) : doc.keys || []; } catch { keys = []; }
  return { ...doc, keys };
}

/* ---------- display names ---------- */

/** A name for the boards: trimmed, single-spaced, 2 to 20 characters, no angle brackets. */
export function cleanName(s) {
  const n = String(s || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20).trim();
  return n.length >= 2 ? n : "";
}
/** The default name for a new account: the first name from Google, or a placeholder. */
export const defaultName = (user) => cleanName((user?.name || "").split(" ")[0]) || cleanName((user?.email || "").split("@")[0]) || "Typist";
