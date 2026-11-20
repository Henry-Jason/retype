// Your quotes and favourites, kept in step between this browser and your account (and so every
// device you sign in on). Pure: the shape both sides store, and how two copies merge.
//
// A "saved" record is { quotes, deleted, favs }:
//   quotes   your own quotes, each { id, text, source, by, series?, at, edited? }
//   deleted  { id: when } for quotes you deleted, so another device can't bring them back
//   favs     { key: when } with when > 0 for a favourite and < 0 for one you took away
// Every change carries a time, and the newer change wins, so merging is safe in any order and
// merging the same thing twice changes nothing.

export const SAVED_LIMITS = { quotes: 5000, deleted: 2000, favs: 10000, bytes: 900_000 };
export const emptySaved = () => ({ quotes: [], deleted: {}, favs: {} });

const when = (q) => Math.max(q.at || 0, q.edited || 0);

/** Favourites as stored before syncing were a plain list of keys; this reads either shape. */
export function normFavs(f) {
  if (Array.isArray(f)) return Object.fromEntries(f.filter((k) => typeof k === "string").map((k) => [k, 1]));
  return f && typeof f === "object" ? { ...f } : {};
}
/** The keys that are favourites right now. */
export const favKeys = (favs) => Object.entries(favs).filter(([, t]) => t > 0).map(([k]) => k);
/** Turn one favourite on or off at time now. */
export const setFav = (favs, key, on, now = Date.now()) => ({ ...favs, [key]: on ? Math.max(now, 1) : -Math.max(now, 1) });

/** Merge two saved records. Newer wins per quote, per deletion and per favourite. */
export function mergeSaved(a, b) {
  a = { ...emptySaved(), ...a }; b = { ...emptySaved(), ...b };
  const deleted = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted)) if (!(deleted[id] >= t)) deleted[id] = t;

  const favs = normFavs(a.favs);
  for (const [k, t] of Object.entries(normFavs(b.favs))) {
    const cur = favs[k];
    // the later change wins; on an exact tie, a favourite beats an un-favourite
    if (cur === undefined || Math.abs(t) > Math.abs(cur) || (Math.abs(t) === Math.abs(cur) && t > cur)) favs[k] = t;
  }

  const byId = new Map();
  for (const q of [...a.quotes, ...b.quotes]) {
    if (!q || typeof q.id !== "string") continue;
    const cur = byId.get(q.id);
    if (!cur || when(q) > when(cur)) byId.set(q.id, q);
  }
  // a deletion only removes the version it saw: re-adding or editing the quote later brings it back
  const quotes = [...byId.values()].filter((q) => !(deleted[q.id] >= when(q))).sort((x, y) => (x.at || 0) - (y.at || 0));

  // tombstones for quotes that are gone anyway only need to outlive the devices that might
  // still have them; keep the newest, up to the limit
  const keep = Object.entries(deleted).sort((x, y) => y[1] - x[1]).slice(0, SAVED_LIMITS.deleted);
  return { quotes, deleted: Object.fromEntries(keep), favs };
}

/**
 * What changed between two versions of your quote list, as the browser saw it: new and edited
 * quotes get a time, removed ones a tombstone. Returns the next saved record.
 */
export function recordChange(saved, nextQuotes, now = Date.now()) {
  const before = new Map(saved.quotes.map((q) => [q.id, q]));
  const after = new Set(nextQuotes.map((q) => q.id));
  const same = (x, y) => x.text === y.text && x.source === y.source && (x.by || "") === (y.by || "") && (x.series || "") === (y.series || "");
  const quotes = nextQuotes.map((q) => {
    const old = before.get(q.id);
    if (!old) return { ...q, at: q.at || now };
    return same(old, q) ? { ...old, ...q } : { ...q, at: old.at || q.at || now, edited: Math.max(now, when(old) + 1) };
  });
  const deleted = { ...saved.deleted };
  for (const id of before.keys()) if (!after.has(id)) deleted[id] = Math.max(now, when(before.get(id)) + 1);
  return { ...saved, quotes, deleted };
}

/** True when two records hold the same things (so there's nothing to send). */
export const sameSaved = (a, b) => JSON.stringify(mergeSaved(a, emptySaved())) === JSON.stringify(mergeSaved(b, emptySaved()));

/** Refuse a record too big to store in one account document. */
export function checkSize(saved) {
  if (saved.quotes.length > SAVED_LIMITS.quotes) return `That's more than ${SAVED_LIMITS.quotes.toLocaleString("en-IE")} quotes of your own; delete some to keep syncing.`;
  if (Object.keys(saved.favs).length > SAVED_LIMITS.favs) return "Too many favourites to sync.";
  if (JSON.stringify(saved).length > SAVED_LIMITS.bytes) return "Your quotes are too large to sync in one go; delete some long ones.";
  return null;
}
