// Your own quotes, kept in this browser. Separate from progress, so signing out or clearing
// progress never throws away a list you've built up. Export/import moves it between browsers.
const KEY = "retype-quotes-v1";

export function loadQuotes(ls = globalThis.localStorage) {
  try {
    const list = JSON.parse(ls.getItem(KEY));
    return Array.isArray(list) ? list.filter((q) => q && typeof q.id === "string" && typeof q.text === "string") : [];
  } catch { return []; }
}
export function saveQuotes(list, ls = globalThis.localStorage) {
  try { ls.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

// Everyone's quotes, cached so the quote pool is ready the moment the page loads (and works
// offline). Refreshed from the server when the cache is older than STALE, or on the Quotes page.
const COMMUNITY = "retype-community-v1";
export const STALE = 30 * 60 * 1000;
export function loadCommunity(ls = globalThis.localStorage) {
  try {
    const c = JSON.parse(ls.getItem(COMMUNITY));
    return c && Array.isArray(c.list) ? c : { at: 0, list: [] };
  } catch { return { at: 0, list: [] }; }
}
/** Keep only what typing needs from each approved quote. */
export const slim = (docs) => docs.map(({ id, text, source, by, series, name, flags }) => ({ id, text, source: source || "", by: by || "", ...(series ? { series } : {}), name: name || "", flags: flags || [] }));
export function saveCommunity(list, at = Date.now(), ls = globalThis.localStorage) {
  try { ls.setItem(COMMUNITY, JSON.stringify({ at, list })); } catch { /* fine: it's only a cache */ }
}

// Favourites: { key: when } (see core/quote-sync.js), kept in this browser and synced to your
// account when you're signed in. Older browsers saved a plain list of keys; normFavs reads both.
import { normFavs } from "../core/quote-sync.js";
const FAVS = "retype-favourites-v1", DELETED = "retype-quotes-deleted-v1";
export function loadFavs(ls = globalThis.localStorage) {
  try { return normFavs(JSON.parse(ls.getItem(FAVS))); } catch { return {}; }
}
export function saveFavs(favs, ls = globalThis.localStorage) {
  try { ls.setItem(FAVS, JSON.stringify(favs)); return true; } catch { return false; }
}
/** Quotes you deleted, with when, so a synced device can't bring them back. */
export function loadDeleted(ls = globalThis.localStorage) {
  try { const d = JSON.parse(ls.getItem(DELETED)); return d && typeof d === "object" && !Array.isArray(d) ? d : {}; } catch { return {}; }
}
export function saveDeleted(d, ls = globalThis.localStorage) {
  try { ls.setItem(DELETED, JSON.stringify(d)); return true; } catch { return false; }
}
/** Signing out: your quotes and favourites are safe in the account, so this browser forgets them. */
export function forgetSaved(ls = globalThis.localStorage) {
  for (const k of [KEY, FAVS, DELETED]) { try { ls.removeItem(k); } catch { /* fine */ } }
}
