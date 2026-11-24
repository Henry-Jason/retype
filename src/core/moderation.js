// Shared quotes: the automatic filter every submission goes through, and the rules for the review
// queue and reports. Pure, so the Cloud Functions and the tests run exactly the same checks.
// The browser never imports this file: the server's verdict is the only one that counts.
import { clean, words, wordCount, makeQuote, LIBRARY, sharedId, REJECT_REASONS, REPORT_REASONS } from "./quotes.js";
export { sharedId, REJECT_REASONS, REPORT_REASONS };

export const SHARE_RULES = {
  perDay: 50,          // submissions a player can make in a day
  pending: 100,        // quotes a player can have waiting for review at once
  batch: 25,           // quotes in one call (a pasted list is sent in batches)
  reportsToHide: 3,    // reports from different players that take a quote down until it's reviewed
  sourceMin: 2, sourceMax: 80
};

/* ---------- the word lists ---------- */

// Slurs: a submission containing one is turned away outright. Kept short and unambiguous on
// purpose; anything that's only sometimes a slur is flagged for the reviewer instead.
const SLURS = [
  "nigger", "niggers", "nigga", "niggas", "chink", "chinks", "gook", "gooks", "spic", "spics", "wetback", "wetbacks",
  "kike", "kikes", "raghead", "ragheads", "towelhead", "towelheads", "sandnigger", "jigaboo", "porchmonkey", "beaner", "beaners",
  "faggot", "faggots", "fagot", "tranny", "trannies", "pikey", "pikeys", "gyppo", "gyppos", "coons"
];
// Strong language: allowed (films swear), but flagged, so the reviewer sees it and players who
// turn on "Hide strong language" don't get these quotes.
const STRONG = ["fuck", "shit", "cunt", "bitch", "bastard", "twat", "wank", "slut", "whore", "asshole", "arsehole", "motherfucker", "bollocks", "prick", "cock", "dick", "pussy", "piss", "retard", "fag", "dyke", "knacker", "coon", "paki"];
// ...matched as the start of a word for these (fucking, shitty, bitches), whole words for the rest
const STEMS = new Set(["fuck", "shit", "bitch", "wank", "piss", "retard", "motherfucker", "asshole", "arsehole", "slut", "whore", "cunt", "twat", "bastard"]);

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s" };
const deleet = (s) => s.toLowerCase().replace(/[0134578@$]/g, (c) => LEET[c] || c);

/** Every way a word in the text could be read: as written, de-leeted, and spaced-out letters joined up. */
export function tokens(text) {
  const raw = deleet(clean(text)).split(/[^a-z]+/).filter(Boolean);
  const out = new Set(raw);
  // "n i g g e r" or "n.i.g.g.e.r": runs of single letters read as one word
  let run = "";
  for (const t of [...raw, ""]) {
    if (t.length === 1) { run += t; continue; }
    if (run.length > 2) out.add(run);
    run = "";
  }
  // stretched letters ("niiigger"): squeeze runs of three or more down to one
  for (const t of raw) if (/(.)\1\1/.test(t)) out.add(t.replace(/(.)\1+/g, "$1$1")).add(t.replace(/(.)\1+/g, "$1"));
  return [...out];
}
const hasSlur = (text) => tokens(text).some((t) => SLURS.includes(t));
const hasStrong = (text) => tokens(text).some((t) => STRONG.some((w) => t === w || (STEMS.has(w) && t.startsWith(w))));

/* ---------- display names ---------- */

// Names show on the boards and to strangers in quick races, so they're held to a stricter line
// than quotes: no strong language at all, no links or handles, and nothing posing as staff.
const RESERVED = ["admin", "administrator", "moderator", "mod", "mods", "retype", "official", "staff", "support", "system"];

/** The same tidying as cleanName in sync.js (kept here: this file runs on the server too). */
const tidyName = (s) => String(s || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20).trim();

/** Check a display name. Returns { ok: true, name } or { ok: false, reason } in words the player can act on. */
export function screenName(raw) {
  const name = tidyName(raw);
  if (name.length < 2) return { ok: false, reason: "Use 2 to 20 characters." };
  if (hasSlur(name) || hasStrong(name)) return { ok: false, reason: "Pick a name without swearing or slurs." };
  if (LINK.test(name) || EMAIL.test(name) || HANDLE.test(name) || /\d{6,}/.test(name)) return { ok: false, reason: "Names can't be links, emails, handles or numbers." };
  if (tokens(name).some((t) => RESERVED.includes(t))) return { ok: false, reason: "That name's reserved. Pick another." };
  return { ok: true, name };
}

/** What a player is called when their name can't be used: Typist and a few characters of their id. */
export const fallbackName = (uid) => `Typist ${String(uid || "").replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "0000"}`;

/** A name that's safe to show: the given one if it passes, otherwise the fallback. */
export const safeName = (raw, uid) => { const r = screenName(raw); return r.ok ? r.name : fallbackName(uid); };

/* ---------- the filter ---------- */

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|gg|xyz|ru|ly|co|uk|ie|me|tv|app|dev|link|info|biz)\b)/i;
const EMAIL = /\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/i;
const HANDLE = /(^|\s)@[a-z0-9_]{2,}/i;
const PHONE = /\d[\d\s-]{8,}\d/;

/**
 * Check one submission. Returns { ok: true, quote, flags } with the tidied quote, or
 * { ok: false, reason } in words the submitter can act on.
 */
export function screenQuote({ text, source, by, series }) {
  const made = makeQuote({ text, source, by, series });
  if (made.error) return { ok: false, reason: made.error };
  const q = made.quote, all = `${q.text} ${q.source} ${q.by} ${q.series || ""}`;
  if (q.source.length < SHARE_RULES.sourceMin) return { ok: false, reason: "Say where it's from (a show, film, book, speech…), so others know what they're typing." };
  if (wordCount(q.text) < 4) return { ok: false, reason: "Shared quotes need at least four words." };
  if (hasSlur(all)) return { ok: false, reason: "That contains a slur, so it can't be shared." };
  if (LINK.test(all) || EMAIL.test(all) || HANDLE.test(all) || PHONE.test(all)) return { ok: false, reason: "No links, emails, handles or phone numbers." };
  if (/(.)\1{5,}/i.test(q.text)) return { ok: false, reason: "That has a character repeated over and over." };
  const ws = words(q.text).map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ""));
  for (let i = 3; i < ws.length; i++) if (ws[i] && ws[i] === ws[i - 1] && ws[i] === ws[i - 2] && ws[i] === ws[i - 3]) return { ok: false, reason: "That repeats the same word over and over." };
  if (ws.length >= 8 && new Set(ws).size / ws.length < 0.3) return { ok: false, reason: "That repeats itself too much." };
  const visible = q.text.replace(/\s/g, ""), letters = (q.text.match(/[a-z]/gi) || []).length;
  if (letters / visible.length < 0.6) return { ok: false, reason: "That's mostly symbols or numbers, not words." };
  const caps = (q.text.match(/[A-Z]/g) || []).length;
  if (letters > 20 && caps / letters > 0.7) return { ok: false, reason: "Please don't write it all in capitals." };
  const lettered = ws.filter((w) => /[a-z]{2,}/.test(w));
  if (lettered.length && lettered.filter((w) => !/[aeiouy]/.test(w)).length / lettered.length > 0.5) return { ok: false, reason: "That doesn't look like words." };
  if (LIBRARY.some((x) => x.text.toLowerCase() === q.text.toLowerCase())) return { ok: false, reason: "That one's already in the library." };
  const flags = [];
  if (hasStrong(all)) flags.push("language");
  return { ok: true, quote: q, flags };
}


/**
 * How much someone may send in. Admins have no daily or waiting cap, and what they share goes
 * live straight away (it still goes through the filter): they'd only be approving their own.
 */
export const limitsFor = (admin) => (admin ? { perDay: Infinity, pending: Infinity, status: "approved" } : { perDay: SHARE_RULES.perDay, pending: SHARE_RULES.pending, status: "pending" });

/** The stored document for a new submission. */
export function submission({ quote, flags, uid, name, now, status = "pending" }) {
  return {
    id: sharedId(quote.text), text: quote.text, source: quote.source, by: quote.by, series: quote.series || "", words: wordCount(quote.text),
    uid, name: name || "", status, flags, reports: 0, at: now, reviewedAt: status === "approved" ? now : null, reason: null
  };
}

/** What to tell the submitter when their quote's text is already on file. */
export function existingVerdict(doc, uid) {
  if (doc.status === "approved") return "Someone's already shared that one.";
  if (doc.status === "rejected") return doc.uid === uid ? "That one was already turned down." : "That one has already been reviewed.";
  return doc.uid === uid ? "That one's already waiting for review." : "Someone else has already sent that one in.";
}

/** Today's submission count, starting again each UTC day. */
export function countToday(limit, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  return limit && limit.day === day ? { day, n: limit.n } : { day, n: 0 };
}

/**
 * A review decision applied to a document. action: approve | reject | restore | remove.
 * edits (approve only) fix typos or the attribution, and go back through the filter, minus
 * the duplicate and four-word checks a reviewer can overrule.
 */
export function review(doc, { action, reason, edits }, now) {
  if (!doc) return { error: "That quote is gone." };
  if (action === "approve" || action === "restore") {
    let next = { ...doc };
    if (action === "approve" && edits) {
      const fields = { text: edits.text ?? doc.text, source: edits.source ?? doc.source, by: edits.by ?? doc.by, series: edits.series ?? doc.series ?? "" };
      const s = screenQuote(fields);
      if (!s.ok && !/library|four words/.test(s.reason)) return { error: s.reason };
      const q = s.ok ? s.quote : makeQuote(fields).quote;
      if (sharedId(q.text) !== doc.id) return { error: "Changing the words gives it a new id; reject it and add the fixed version yourself." };
      next = { ...next, text: q.text, source: q.source, by: q.by, series: q.series || "", words: wordCount(q.text), flags: s.ok ? s.flags : doc.flags };
    }
    return { doc: { ...next, status: "approved", reviewedAt: now, reason: null, reports: action === "restore" ? 0 : doc.reports } };
  }
  if (action === "reject" || action === "remove") {
    if (!REJECT_REASONS[reason]) return { error: "Pick a reason." };
    return { doc: { ...doc, status: "rejected", reviewedAt: now, reason } };
  }
  return { error: "Unknown action." };
}

/** A report from one player: counted once each, and enough of them hide the quote until it's reviewed. */
export function report(doc, { uid, reason, already }) {
  if (!doc || doc.status !== "approved") return { error: "That quote isn't live." };
  if (!REPORT_REASONS[reason]) return { error: "Pick a reason." };
  if (doc.uid === uid) return { error: "That's your own quote; withdraw it from the Quotes page instead." };
  if (already) return { doc, counted: false };
  const reports = (doc.reports || 0) + 1;
  return { doc: { ...doc, reports, status: reports >= SHARE_RULES.reportsToHide ? "hidden" : "approved" }, counted: true };
}
