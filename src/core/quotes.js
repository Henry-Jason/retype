// Quotes: the built-in library, your own quotes, picking one to type, and importing a pasted list.
// Pure functions only; saving your own quotes lives in storage/quote-store.js.
import RAW from "../data/quotes.js";
import { pick } from "./rng.js";

export const LENGTHS = {
  any: { label: "Any length" },
  short: { label: "Short", max: 20 },
  medium: { label: "Medium", min: 21, max: 45 },
  long: { label: "Long", min: 46 }
};
export const CATEGORIES = { speech: "Speeches", science: "Science and space", philosophy: "Philosophy", literature: "Literature", poetry: "Poetry", proverb: "Proverbs and drills" };
export const MAX_CHARS = 2000;

/** Make text typable on an ordinary keyboard: straight quotes, plain dashes, no accents, single spaces. */
export function clean(text) {
  return String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’‚′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[  -​ 　\s]+/g, " ")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();
}
export const words = (text) => clean(text).split(" ").filter(Boolean);
export const wordCount = (text) => words(text).length;
export function lengthOf(text) {
  const n = wordCount(text);
  return n <= LENGTHS.short.max ? "short" : n <= LENGTHS.medium.max ? "medium" : "long";
}

/** FNV-1a over the cleaned text, so the same quote always has the same id. */
export function quoteId(text, prefix = "q") {
  let h = 0x811c9dc5;
  for (const ch of clean(text).toLowerCase()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return prefix + h.toString(36);
}

/** The id a shared quote is stored under: the same words, whatever the punctuation or capitals, land on the same document. */
export const sharedId = (text) => quoteId(clean(text).replace(/[^a-z0-9 ]/gi, "").replace(/ +/g, " ").trim(), "s");
export const REJECT_REASONS = {
  offensive: "Offensive or hateful",
  fake: "Not a real quote",
  wrong: "Wrong wording or attribution",
  spam: "Spam, ads or nonsense",
  duplicate: "Already shared",
  other: "Doesn't fit"
};
export const REPORT_REASONS = { offensive: "Offensive", wrong: "Wrong or misattributed", spam: "Spam or nonsense" };

export const LIBRARY = RAW.map(([text, by, source, cat]) => ({ id: quoteId(text), text: clean(text), by, source, cat, mine: false }));

/**
 * The pools quotes come from: the library, everyone's (shared quotes other players added and an
 * admin approved), and yours (kept in this browser). Functions take { mine, community }, or just
 * your list. Each quote says where it's from: origin "library" | "community" | "mine".
 */
const pools = (p) => (Array.isArray(p) ? { mine: p, community: [] } : { mine: p?.mine || [], community: p?.community || [] });
export function allQuotes(p) {
  const { mine, community } = pools(p);
  return [
    ...LIBRARY.map((q) => ({ ...q, origin: "library" })),
    ...community.map((q) => ({ ...q, mine: false, community: true, origin: "community" })),
    ...mine.map((q) => ({ ...q, mine: true, origin: "mine" }))
  ];
}
export const findQuote = (id, p) => allQuotes(p).find((q) => q.id === id) || null;

/** The source a quote is filed under for filtering: what it's from, or who said it if that's all there is. */
export const sourceOf = (q) => (q.origin === "library" || (!q.mine && !q.community) ? CATEGORIES[q.cat] || "Library" : q.source || q.by || "Untitled");

/* ---------- series: franchises and universes that group several sources ---------- */

// Guesses for common cases, so nobody has to fill the field in. Order matters: the first match wins.
const MCU = ["Iron Man", "The Incredible Hulk", "Thor", "Captain America", "The Avengers", "Avengers:", "Guardians of the Galaxy",
  "Ant-Man", "Doctor Strange", "Spider-Man: Homecoming", "Spider-Man: Far From Home", "Spider-Man: No Way Home", "Black Panther",
  "Black Widow", "Captain Marvel", "Shang-Chi", "Eternals", "WandaVision", "Loki", "The Falcon and the Winter Soldier", "Hawkeye",
  "Moon Knight", "Ms. Marvel", "She-Hulk", "Secret Invasion", "Echo", "Agatha All Along", "Deadpool & Wolverine", "The Marvels",
  "Thunderbolts", "What If...?", "Daredevil: Born Again", "The Fantastic Four: First Steps", "Ironheart"];
export const SERIES_RULES = [
  ["Harry Potter", (s) => /^Harry Potter and the (Philosopher's|Sorcerer's|Chamber|Prisoner|Goblet|Order|Half-Blood|Deathly)/i.test(s) || /^(Harry Potter|Fantastic Beasts)\b(?!.*Methods of Rationality)/i.test(s)],
  ["Middle-earth", (s) => /^(The Hobbit|The Lord of the Rings|The Fellowship of the Ring|The Two Towers|The Return of the King|The Silmarillion|The Rings of Power)\b/i.test(s)],
  ["Marvel Cinematic Universe", (s) => s === "Marvel Cinematic Universe" || MCU.some((t) => s === t || (t.endsWith(":") ? s.startsWith(t) : s.startsWith(t + ":") || s.startsWith(t + " ") || s === t))],
  ["Spider-Man", (s) => /spider-?man|spider-verse/i.test(s)],
  ["Batman", (s) => /^(The Dark Knight|The Dark Knight Rises|Batman Begins|The Batman)$/i.test(s)],
  ["Avatar: The Last Airbender", (s) => /^(Avatar: The Last Airbender|The Legend of Korra)$/i.test(s)],
  ["Breaking Bad", (s) => /^(Breaking Bad|Better Call Saul|El Camino)/i.test(s)],
  ["Game of Thrones", (s) => /^(A )?Game of Thrones$|^(A Clash of Kings|A Storm of Swords|A Feast for Crows|A Dance with Dragons|House of the Dragon|A Song of Ice and Fire)/i.test(s)],
  ["Dune", (s) => /^(Dune|Dune Messiah|Children of Dune|God Emperor of Dune|Heretics of Dune|Chapterhouse: Dune)\b/i.test(s)],
  ["Three-Body", (s) => /^(3 Body Problem|The Three-Body Problem|The Dark Forest|Death's End)$/i.test(s)],
  ["The Witcher", (s) => /witcher/i.test(s)],
  ["Interstellar", (s) => /^(Interstellar|The Science of Interstellar)$/i.test(s)],
  ["Star Wars", (s) => /^(Star Wars|Andor|The Mandalorian|Rogue One|Obi-Wan Kenobi|Ahsoka)\b/i.test(s)]
];
// Spider-Man: Homecoming and friends are matched as Marvel first; Middle-earth before anything with "Ring" in it.
export function guessSeries(source) {
  const s = String(source || "").trim();
  if (!s) return null;
  const hit = SERIES_RULES.find(([, test]) => test(s));
  return hit ? hit[0] : null;
}
/** The series a quote belongs to: the one it was given, or the guess from its source. Library quotes have none. */
export const seriesOf = (q) => (q.origin === "library" || (!q.mine && !q.community) ? null : q.series || guessSeries(q.source));
/** "Only from" values: a plain source name, or "series:<name>" for every source in a series. */
export const SERIES_PREFIX = "series:";

/** All sources, with how many quotes each has; yours first, then everyone's, then the library's categories. */
export function sources(p) {
  const counts = new Map(), rank = { mine: 0, community: 1, library: 2 };
  for (const q of allQuotes(p)) {
    const k = sourceOf(q);
    const c = counts.get(k) || { name: k, count: 0, mine: q.origin === "mine", origin: q.origin };
    c.count++; counts.set(k, c);
    if (rank[q.origin] < rank[c.origin]) { c.origin = q.origin; c.mine = q.origin === "mine"; }
  }
  return [...counts.values()].sort((a, b) => rank[a.origin] - rank[b.origin] || a.name.localeCompare(b.name));
}

/**
 * What the "Only from" list shows: series that cover two or more sources (with their sources
 * inside), then every other source on its own. Each entry has a value to filter by.
 * opts.from limits it to one pool, as the quote settings do.
 */
export function sourceTree(p, { from = "all" } = {}) {
  const groups = new Map(), loose = new Map(), rank = { mine: 0, community: 1, library: 2 };
  for (const q of filterQuotes(p, { from })) {
    const name = sourceOf(q), series = seriesOf(q);
    const key = series || "";
    if (!groups.has(key)) groups.set(key, { name: series, count: 0, origin: q.origin, sources: new Map() });
    const g = groups.get(key); g.count++;
    if (rank[q.origin] < rank[g.origin]) g.origin = q.origin;
    const src = g.sources.get(name) || { name, value: name, count: 0, origin: q.origin };
    src.count++; g.sources.set(name, src);
    if (rank[q.origin] < rank[src.origin]) src.origin = q.origin;
  }
  const out = [];
  for (const g of groups.values()) {
    const list = [...g.sources.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (g.name && (list.length > 1 || list[0].name !== g.name)) out.push({ name: g.name, value: SERIES_PREFIX + g.name, count: g.count, origin: g.origin, sources: list });
    else for (const s of list) loose.set(s.name, s);
  }
  const all = [...out, ...loose.values()];
  return all.sort((a, b) => rank[a.origin] - rank[b.origin] || a.name.localeCompare(b.name));
}
/** Every value "Only from" could hold right now, to tell whether a saved choice still exists. */
export const sourceValues = (tree) => tree.flatMap((x) => [x.value, ...(x.sources || []).map((s) => s.value)]);

/**
 * opts: { from: "all"|"library"|"community"|"mine", len: key of LENGTHS, source: name or null,
 * search, clean: leave out quotes flagged for strong language }. With from "all", a quote of yours
 * that's also been shared (or is in the library) only counts once.
 */
export function filterQuotes(p, { from = "all", len = "any", source = null, search = "", clean: tidy = false } = {}) {
  const s = search.trim().toLowerCase();
  const seen = new Set();
  return allQuotes(p).filter((q) => {
    if (from !== "all" && from !== q.origin) return false;
    if (from === "all") { const k = q.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); }
    return (len === "any" || lengthOf(q.text) === len) &&
      (!source || (source.startsWith(SERIES_PREFIX) ? seriesOf(q) === source.slice(SERIES_PREFIX.length) : sourceOf(q) === source)) &&
      (!tidy || !(q.flags || []).includes("language")) &&
      (!s || `${q.text} ${q.by || ""} ${q.source || ""} ${q.name || ""}`.toLowerCase().includes(s));
  });
}

/**
 * Pick a quote to type. Never the one just typed if there's any other choice. If nothing matches
 * the length, any length from the same pool will do; if the pool is empty, the whole library.
 * Returns { quote, widened } where widened says the filters had to be relaxed.
 */
export function pickQuote(p, opts, rand, lastId = null) {
  const tries = [opts, { ...opts, len: "any" }, { ...opts, len: "any", source: null }, { from: "all", clean: opts.clean }];
  for (let i = 0; i < tries.length; i++) {
    const pool = filterQuotes(p, tries[i]);
    if (!pool.length) continue;
    const fresh = pool.length > 1 ? pool.filter((q) => q.id !== lastId) : pool;
    return { quote: pick(rand, fresh), widened: i > 0 };
  }
  return { quote: LIBRARY[0], widened: true };
}

/* ---------- your own quotes ---------- */

/** Check and tidy a quote before saving. Returns { quote } or { error }. */
export function makeQuote({ text, source = "", by = "", series = "" }, { id, at = Date.now() } = {}) {
  const t = clean(text);
  if (wordCount(t) < 2) return { error: "A quote needs at least two words." };
  if (t.length > MAX_CHARS) return { error: `Keep it under ${MAX_CHARS.toLocaleString("en-IE")} characters.` };
  const q = { id: id || quoteId(t, "u"), text: t, source: clean(source).slice(0, 80), by: clean(by).slice(0, 80), at };
  // only kept when it says something the source doesn't already
  const sr = clean(series).slice(0, 80);
  if (sr && sr !== guessSeries(q.source)) q.series = sr;
  return { quote: q };
}

/** Add quotes, skipping any already there (yours or the library's). Returns { list, added, skipped, errors }. */
export function addQuotes(list, incoming, at = Date.now()) {
  const have = new Set([...LIBRARY, ...list].map((q) => clean(q.text).toLowerCase()));
  const out = list.slice(); let added = 0, skipped = 0; const errors = [];
  incoming.forEach((raw, i) => {
    const r = makeQuote(raw, { at: at + i });
    if (r.error) { errors.push(r.error); return; }
    const key = r.quote.text.toLowerCase();
    if (have.has(key)) { skipped++; return; }
    have.add(key); out.push(r.quote); added++;
  });
  return { list: out, added, skipped, errors };
}

export function updateQuote(list, id, fields) {
  const old = list.find((q) => q.id === id);
  if (!old) return { error: "That quote is gone." };
  const r = makeQuote({ ...old, ...fields }, { id, at: old.at });
  if (r.error) return r;
  const dupe = [...LIBRARY, ...list].some((q) => q.id !== id && clean(q.text).toLowerCase() === r.quote.text.toLowerCase());
  if (dupe) return { error: "You already have that quote." };
  return { list: list.map((q) => (q.id === id ? r.quote : q)) };
}

/**
 * Read a pasted list. Either JSON (objects with text, source and by, as exported; see
 * parseJsonList for how forgiving that is), or plain text:
 * quotes separated by blank lines, each optionally ending with an attribution line that starts
 * with a dash, like "- Source" or "- Who, Source". A single block of lines with no blank lines
 * and no attributions is read as one quote per line. defaultSource fills in a missing source.
 */
export function parseImport(text, defaultSource = "") {
  const src = String(text ?? "").trim();
  if (!src) return [];
  if (src.startsWith("[") || src.startsWith("{")) return parseJsonList(src, defaultSource);
  const attr = /^\s*(?:-{1,2}|–|—|~)\s*(.+)$/;
  const blocks = src.split(/\r?\n\s*\r?\n/);
  const lines = src.split(/\r?\n/).filter((l) => l.trim());
  const units = blocks.length === 1 && lines.length > 1 && !lines.some((l) => attr.test(l)) ? lines.map((l) => [l]) : blocks.map((b) => b.split(/\r?\n/).filter((l) => l.trim()));
  return units.map((ls) => {
    let source = defaultSource, by = "";
    const m = ls.length > 1 && ls[ls.length - 1].match(attr);
    if (m) {
      ls = ls.slice(0, -1);
      const comma = m[1].indexOf(",");
      if (comma > 0) { by = m[1].slice(0, comma).trim(); source = m[1].slice(comma + 1).trim() || defaultSource; }
      else source = m[1].trim();
    }
    // a quote wrapped in quotation marks loses them
    const body = ls.join(" ").trim().replace(/^["“](.*)["”]$/s, "$1");
    return { text: body, source, by };
  }).filter((q) => q.text);
}

// Field names people tend to use, mapped onto ours.
const PICK = {
  text: ["text", "quote", "line", "content", "body"],
  source: ["source", "from", "film", "movie", "show", "series", "book", "work", "title"],
  by: ["by", "who", "author", "character", "speaker", "person", "said_by", "saidBy"],
  series: ["series", "franchise", "universe", "saga"]
};
const field = (o, keys) => { for (const k of keys) if (typeof o[k] === "string" && o[k].trim()) return o[k]; return ""; };

/**
 * A pasted JSON list, read forgivingly: square brackets optional, trailing commas fine, extra
 * fields (id, length…) ignored, and common names like "quote" or "author" understood. Throws
 * with the line to look at when it can't be read, rather than guessing.
 */
function parseJsonList(src, defaultSource) {
  let body = src.replace(/,\s*([\]}])/g, "$1").replace(/,\s*$/, "");
  if (body.startsWith("{")) body = `[${body}]`;
  let data;
  try { data = JSON.parse(body); }
  catch (e) {
    // browsers word this differently: Chrome and Node give a position, Firefox a line
    const at = /position (\d+)/.exec(e.message), ln = /line (\d+)/.exec(e.message);
    const line = at ? body.slice(0, +at[1]).split("\n").length : ln ? +ln[1] : null;
    throw new Error(`That looks like a JSON list but couldn't be read${line ? ` (around line ${line})` : ""}. Check for a missing comma, quote mark or bracket.`);
  }
  const list = Array.isArray(data) ? data : [data];
  return list.filter((x) => x && typeof x === "object" && field(x, PICK.text))
    .map((x) => ({ text: field(x, PICK.text), source: field(x, PICK.source) || defaultSource, by: field(x, PICK.by), ...(field(x, PICK.series) ? { series: field(x, PICK.series) } : {}) }));
}

/** What to export: your quotes, plain enough to paste back in. */
export const exportQuotes = (list) => JSON.stringify(list.map(({ text, source, by, series }) => ({ text, source, by, ...(series ? { series } : {}) })), null, 2);
