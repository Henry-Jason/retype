import { describe, it, expect } from "vitest";
import { LIBRARY, clean, words, lengthOf, quoteId, pickQuote, filterQuotes, sources, makeQuote, addQuotes, updateQuote, parseImport, exportQuotes } from "../src/core/quotes.js";
import { encodeChallenge, decodeChallenge } from "../src/core/challenge.js";
import { modeKey, updateBests } from "../src/core/progress.js";
import { countsForPp } from "../src/core/pp.js";
import { mulberry32 } from "../src/core/rng.js";
import { loadQuotes, saveQuotes } from "../src/storage/quote-store.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe("the library", () => {
  it("has unique ids, attributions and only typable characters", () => {
    expect(LIBRARY.length).toBeGreaterThan(150);
    expect(new Set(LIBRARY.map((q) => q.id)).size).toBe(LIBRARY.length);
    expect(new Set(LIBRARY.map((q) => q.text.toLowerCase())).size).toBe(LIBRARY.length);
    for (const q of LIBRARY) {
      expect(q.text).toMatch(/^[\x20-\x7e]+$/);
      expect(q.text).not.toMatch(/ {2}/);
      expect(q.by && q.source).toBeTruthy();
    }
  });
  it("covers every length", () => {
    for (const len of ["short", "medium", "long"]) expect(filterQuotes([], { from: "library", len }).length).toBeGreaterThan(5);
  });
});

describe("cleaning", () => {
  it("turns curly quotes, dashes, ellipses and accents into keys on a keyboard", () => {
    expect(clean("“It’s — fine…”  said Zoë")).toBe('"It\'s - fine..." said Zoe');
    expect(words("  one  two\nthree ")).toEqual(["one", "two", "three"]);
  });
  it("buckets by word count", () => {
    expect(lengthOf("a ".repeat(20))).toBe("short");
    expect(lengthOf("a ".repeat(21))).toBe("medium");
    expect(lengthOf("a ".repeat(46))).toBe("long");
  });
  it("gives the same id however the text is dressed", () => {
    expect(quoteId("It’s  fine")).toBe(quoteId("it's fine"));
  });
});

describe("picking", () => {
  const mine = [{ id: "u1", text: "one two three", source: "Arcane", by: "Jinx" }, { id: "u2", text: "four five six", source: "Arcane" }];
  it("respects where from, length and source", () => {
    const r = pickQuote(mine, { from: "mine", len: "short", source: "Arcane" }, mulberry32(1));
    expect(["u1", "u2"]).toContain(r.quote.id);
    expect(r.widened).toBe(false);
  });
  it("never repeats the last quote when there's another", () => {
    for (let s = 0; s < 20; s++) expect(pickQuote(mine, { from: "mine" }, mulberry32(s), "u1").quote.id).toBe("u2");
  });
  it("widens the search when nothing matches", () => {
    const r = pickQuote(mine, { from: "mine", len: "long" }, mulberry32(3));
    expect(r.widened).toBe(true);
    expect(["u1", "u2"]).toContain(r.quote.id);
    expect(pickQuote([], { from: "mine" }, mulberry32(3)).quote).toBeTruthy();
  });
  it("lists your sources first, with counts", () => {
    const s = sources(mine);
    expect(s[0]).toEqual({ name: "Arcane", count: 2, mine: true, origin: "mine" });
    expect(s.some((x) => x.name === "Speeches" && !x.mine)).toBe(true);
  });
  it("adds everyone's quotes, keeps each quote once and can hide strong language", () => {
    const community = [{ id: "s1", text: "one two three", source: "Arcane", name: "Ana" }, { id: "s2", text: "a shared line here", source: "Dune", flags: ["language"] }];
    const p = { mine, community };
    expect(filterQuotes(p, { from: "community" }).map((q) => q.id)).toEqual(["s1", "s2"]);
    const all = filterQuotes(p, { from: "all", source: "Arcane" }).map((q) => q.id);
    expect(all).toEqual(["s1", "u2"]); // u1 is the same text as s1
    expect(filterQuotes(p, { from: "community", clean: true }).map((q) => q.id)).toEqual(["s1"]);
    expect(filterQuotes(p, { from: "community", search: "ana" }).map((q) => q.id)).toEqual(["s1"]);
    expect(sources(p).find((x) => x.name === "Dune")).toMatchObject({ origin: "community", count: 1 });
  });
  it("searches text, speaker and source", () => {
    expect(filterQuotes(mine, { from: "mine", search: "jinx" }).map((q) => q.id)).toEqual(["u1"]);
  });
});

describe("your own quotes", () => {
  it("rejects one-word and huge quotes", () => {
    expect(makeQuote({ text: "Hi" }).error).toBeTruthy();
    expect(makeQuote({ text: "word ".repeat(500) }).error).toBeTruthy();
  });
  it("adds new ones and skips duplicates, including library quotes", () => {
    const a = addQuotes([], [{ text: "Hello there friend", source: "S" }, { text: "hello  there friend" }, { text: LIBRARY[0].text }, { text: "x" }], 1000);
    expect(a.added).toBe(1); expect(a.skipped).toBe(2); expect(a.errors.length).toBe(1);
    expect(a.list[0]).toMatchObject({ text: "Hello there friend", source: "S", by: "", at: 1000 });
    expect(a.list[0].id).toMatch(/^u/);
  });
  it("edits in place and refuses to make a duplicate", () => {
    const { list } = addQuotes([], [{ text: "first quote here" }, { text: "second quote here" }]);
    const r = updateQuote(list, list[0].id, { source: "Arcane" });
    expect(r.list[0]).toMatchObject({ id: list[0].id, source: "Arcane" });
    expect(updateQuote(list, list[0].id, { text: "second quote here" }).error).toBeTruthy();
  });
  it("saves to and loads from storage, ignoring junk", () => {
    const ls = mem();
    expect(loadQuotes(ls)).toEqual([]);
    saveQuotes([{ id: "u1", text: "a b" }, null, { nope: 1 }], ls);
    expect(loadQuotes(ls)).toEqual([{ id: "u1", text: "a b" }]);
    ls.setItem("retype-quotes-v1", "{broken");
    expect(loadQuotes(ls)).toEqual([]);
  });
});

describe("pasting a list", () => {
  it("reads blocks with attribution lines", () => {
    const got = parseImport(`"First quote, over
two lines"
- Someone, Somewhere

Second quote
— Elsewhere

Third quote with no attribution`, "Default");
    expect(got).toEqual([
      { text: "First quote, over two lines", source: "Somewhere", by: "Someone" },
      { text: "Second quote", source: "Elsewhere", by: "" },
      { text: "Third quote with no attribution", source: "Default", by: "" }
    ]);
  });
  it("reads one quote per line when there's nothing else to go on", () => {
    expect(parseImport("one two\nthree four\n", "Show").map((q) => q.text)).toEqual(["one two", "three four"]);
  });
  it("reads JSON without brackets, with trailing commas and extra fields", () => {
    const pasted = `{
      "text": "If you have to ask, you will never know.",
      "source": "Some Book",
      "id": 8,
      "length": 72
    },
    { "quote": "Second one here", "film": "Some Film", "character": "Someone", },`;
    expect(parseImport(pasted, "Default")).toEqual([
      { text: "If you have to ask, you will never know.", source: "Some Book", by: "" },
      { text: "Second one here", source: "Some Film", by: "Someone" }
    ]);
    expect(parseImport(`[{ "text": "only text here" }]`, "Default")).toEqual([{ text: "only text here", source: "Default", by: "" }]);
  });
  it("says where broken JSON goes wrong instead of reading it line by line", () => {
    expect(() => parseImport(`[\n{ "text": "one two" }\n{ "text": "three four" }\n]`)).toThrow(/line 3/);
  });
  it("round-trips the export", () => {
    const { list } = addQuotes([], [{ text: "a quote to keep", source: "S", by: "B" }]);
    expect(parseImport(exportQuotes(list))).toEqual([{ text: "a quote to keep", source: "S", by: "B" }]);
  });
});

describe("challenges, bests and PP", () => {
  const from = { name: "Henry", wpm: 80, acc: 97.5 };
  it("sends library quotes by id and your own by text", () => {
    const lib = decodeChallenge(encodeChallenge({ mode: "quote", quote: LIBRARY[5], from }));
    expect(lib.quote.id).toBe(LIBRARY[5].id);
    expect(lib.from).toEqual(from);
    const own = decodeChallenge(encodeChallenge({ mode: "quote", quote: { id: "u1", text: "My own quote here", source: "Arcane", by: "Vi" } }));
    expect(own.quote).toMatchObject({ text: "My own quote here", source: "Arcane", by: "Vi", mine: true, shared: true });
  });
  it("rejects a quote link that doesn't add up", () => {
    const enc = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
    expect(decodeChallenge(enc({ v: 1, m: "q", x: "qnope" }))).toBeNull();
    expect(decodeChallenge(enc({ v: 1, m: "q", q: "x" }))).toBeNull();
  });
  it("keeps quote bests per length, for whole quotes only, and earns no PP", () => {
    const r = { kind: "quote", mode: "quote", length: 30, wordsDone: 30, score: 50, wpm: 60, acc: 95, at: 1, id: "a" };
    expect(modeKey(r)).toBe("quote:medium");
    expect(updateBests({}, r).isBest).toBe(true);
    expect(updateBests({}, { ...r, wordsDone: 29 }).isBest).toBe(false);
    expect(updateBests({}, { ...r, length: 4, wordsDone: 4 }).isBest).toBe(false);
    expect(countsForPp(r)).toBe(false);
  });
});
