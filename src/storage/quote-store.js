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
export const slim = (docs) => docs.map(({ id, text, source, by, name, flags }) => ({ id, text, source: source || "", by: by || "", name: name || "", flags: flags || [] }));
export function saveCommunity(list, at = Date.now(), ls = globalThis.localStorage) {
  try { ls.setItem(COMMUNITY, JSON.stringify({ at, list })); } catch { /* fine: it's only a cache */ }
}
