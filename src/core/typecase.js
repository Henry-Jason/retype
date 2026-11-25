// The type case: a perfect galley (25+ words, no mistakes, nothing fixed) drops one piece of
// metal type. Common letters drop often, rare sorts (q, z, &, ¶…) seldom. Fill a row of the case
// and something new unlocks for the desk (core/unlocks.js). Pure: the piece is worked out from
// the galley's id, so this browser and the account always agree on what dropped.
import { mulberry32 } from "./rng.js";

export const SORTS = {
  common: "etaoinshr".split(""),
  uncommon: "dlcumwfgypbv".split(""),
  rare: ["k", "j", "x", "q", "z", "&", "¶"]
};
const CHANCE = { common: 0.62, uncommon: 0.3 }; // the rest: rare
export const ALL_SORTS = [...SORTS.common, ...SORTS.uncommon, ...SORTS.rare];
export const rarity = (ch) => (SORTS.rare.includes(ch) ? "rare" : SORTS.uncommon.includes(ch) ? "uncommon" : "common");

/** Rows of the case: complete one and its reward unlocks. */
export const ROWS = [
  { id: "vowels", label: "The vowels", sorts: ["a", "e", "i", "o", "u"] },
  { id: "home", label: "The home row", sorts: "asdfghjkl".split("") },
  { id: "alphabet", label: "The whole alphabet", sorts: "abcdefghijklmnopqrstuvwxyz".split("") },
  { id: "rare", label: "The rare sorts", sorts: SORTS.rare }
];

const fnv = (s) => { let h = 0x811c9dc5; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

/** Does this galley earn a piece of type? */
export const earnsSort = (r) => !!r && r.clean && (r.wordsDone || 0) >= 25 && r.kind !== "practice" && r.kind !== "code";

/** The piece this galley drops, or null. */
export function sortFor(r) {
  if (!earnsSort(r)) return null;
  const rand = mulberry32(fnv(`type-${r.id}`));
  const roll = rand(), list = roll < CHANCE.common ? SORTS.common : roll < CHANCE.common + CHANCE.uncommon ? SORTS.uncommon : SORTS.rare;
  return list[Math.floor(rand() * list.length)];
}

/** The case with one more piece. */
export const addSort = (tc = {}, ch) => (ch ? { ...tc, [ch]: (tc[ch] || 0) + 1 } : tc);

/** Two copies of the case (this browser and the account): the larger count of each piece. */
export function mergeCase(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) if (ALL_SORTS.includes(k) && Number.isFinite(v)) out[k] = Math.max(out[k] || 0, v);
  return out;
}

/** Which rows are complete. */
export const rowsDone = (tc = {}) => ROWS.filter((r) => r.sorts.every((s) => (tc[s] || 0) > 0)).map((r) => r.id);

/** Rows this piece just completed. */
export const rowsCompleted = (before = {}, after = {}) => { const was = new Set(rowsDone(before)); return rowsDone(after).filter((id) => !was.has(id)); };
