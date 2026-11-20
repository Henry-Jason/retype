// Challenges and the daily galley. Both work without a server: a galley is fully described by its
// seed and settings, so a link (or today's date) is enough for two people to type the same words.
import { LISTS } from "./words.js";
import { SNIPPETS } from "./code.js";
import { LIBRARY, makeQuote } from "./quotes.js";

const LIMITS = { w: [1, 1000], t: [5, 600] };

/* ---------- links ---------- */

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

/**
 * c: { seed, mode: "words"|"time"|"code"|"quote", length, list, punct, nums, sudden, snippet, quote, from: { name, wpm, acc } }
 * A library quote travels by id; one of your own carries its text, so a friend can type it too.
 * Packed with short keys so links stay short.
 */
export function encodeChallenge(c) {
  const o = { v: 1, m: c.mode === "words" ? "w" : c.mode === "time" ? "t" : c.mode === "quote" ? "q" : "c" };
  if (o.m === "c") o.x = c.snippet;
  else if (o.m === "q") {
    if (LIBRARY.some((q) => q.id === c.quote.id)) o.x = c.quote.id;
    else Object.assign(o, { q: c.quote.text, o: c.quote.source || "", b: c.quote.by || "" });
  }
  else Object.assign(o, { s: c.seed >>> 0, n: c.length, l: c.list, p: c.punct ? 1 : 0, u: c.nums ? 1 : 0, d: c.sudden ? 1 : 0 });
  if (c.from) {
    const name = (c.from.name || "").trim().slice(0, 20);
    if (name) o.f = name;
    o.w = Math.round(c.from.wpm);
    o.a = Math.round(c.from.acc * 10);
  }
  return b64url(JSON.stringify(o));
}

/** Returns the challenge, or null if the link is damaged or asks for something out of range. */
export function decodeChallenge(str) {
  let o;
  try { o = JSON.parse(unb64url(str)); } catch { return null; }
  if (!o || o.v !== 1 || !["w", "t", "c", "q"].includes(o.m)) return null;
  const from = Number.isFinite(o.w) && Number.isFinite(o.a) && o.w >= 0 && o.w < 1000 && o.a >= 0 && o.a <= 1000
    ? { name: typeof o.f === "string" ? o.f.slice(0, 20) : "", wpm: o.w, acc: o.a / 10 } : null;
  if (o.m === "c") {
    if (!SNIPPETS.some((s) => s.id === o.x)) return null;
    return { mode: "code", snippet: o.x, from };
  }
  if (o.m === "q") {
    if (o.x != null) {
      const q = LIBRARY.find((x) => x.id === o.x);
      return q ? { mode: "quote", quote: q, from } : null;
    }
    if (typeof o.q !== "string") return null;
    const r = makeQuote({ text: o.q, source: typeof o.o === "string" ? o.o : "", by: typeof o.b === "string" ? o.b : "" });
    return r.error ? null : { mode: "quote", quote: { ...r.quote, mine: true, shared: true }, from };
  }
  const [lo, hi] = LIMITS[o.m];
  if (!Number.isInteger(o.n) || o.n < lo || o.n > hi) return null;
  if (!Number.isInteger(o.s) || o.s < 0 || o.s > 0xffffffff) return null;
  if (!LISTS[o.l]) return null;
  return { mode: o.m === "w" ? "words" : "time", seed: o.s, length: o.n, list: o.l, punct: !!o.p, nums: !!o.u, sudden: !!o.d, from };
}

/* ---------- the daily galley ---------- */

export const DAILY = { mode: "words", length: 40, list: "1k", punct: false, nums: false, sudden: false };

/** FNV-1a: the same day always gives the same seed, everywhere. */
export function dailySeed(day) {
  let h = 0x811c9dc5;
  for (const ch of `retype-daily-${day}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Who won, by score (wpm × accuracy²); a near-tie within 0.5 is called a draw. */
export function compare(mine, theirs, score) {
  const a = score(mine.wpm, mine.acc), b = score(theirs.wpm, theirs.acc), diff = a - b;
  return { mine: a, theirs: b, diff, result: Math.abs(diff) < 0.5 ? "draw" : diff > 0 ? "win" : "loss" };
}
