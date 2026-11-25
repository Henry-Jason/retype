import { describe, it, expect } from "vitest";
import { sortFor, earnsSort, addSort, mergeCase, rowsDone, rowsCompleted, rarity, ALL_SORTS, ROWS } from "../src/core/typecase.js";
import { recordRace, mergeRaces, emptyRaces } from "../src/core/races.js";
import { applyResult } from "../src/storage/progress-service.js";
import { emptyState } from "../src/storage/progress-service.js";
import { isUnlocked, needs, UNLOCKS } from "../src/core/unlocks.js";
import { foldResult, mergeExtras, docFrom } from "../src/core/sync.js";

const perfect = (id, extra = {}) => ({ id, kind: "normal", mode: "words", length: 25, list: "200", wordsDone: 25, clean: true, wpm: 60, acc: 100, score: 60, secs: 25, keyCount: 150, at: Date.UTC(2026, 10, 20, 12), day: "2026-11-20", errors: 0, fixes: 0, ...extra });

describe("the type case", () => {
  it("drops a piece only for perfect galleys of 25 words or more", () => {
    expect(earnsSort(perfect("a"))).toBe(true);
    expect(earnsSort(perfect("a", { clean: false }))).toBe(false);
    expect(earnsSort(perfect("a", { wordsDone: 24 }))).toBe(false);
    expect(earnsSort(perfect("a", { kind: "practice" }))).toBe(false);
    expect(sortFor(perfect("a", { clean: false }))).toBe(null);
  });
  it("drops the same piece for the same galley, rare pieces seldom", () => {
    expect(sortFor(perfect("g-1"))).toBe(sortFor(perfect("g-1")));
    const n = 3000, got = Array.from({ length: n }, (_, i) => sortFor(perfect(`g-${i}`)));
    expect(got.every((c) => ALL_SORTS.includes(c))).toBe(true);
    const rare = got.filter((c) => rarity(c) === "rare").length / n;
    expect(rare).toBeGreaterThan(0.05); expect(rare).toBeLessThan(0.12);
  });
  it("knows when a row is complete, and merges two copies by the larger count", () => {
    let tc = {};
    for (const c of ["a", "e", "i", "o"]) tc = addSort(tc, c);
    expect(rowsDone(tc)).toEqual([]);
    const after = addSort(tc, "u");
    expect(rowsCompleted(tc, after)).toEqual(["vowels"]);
    expect(mergeCase({ a: 2, e: 1 }, { a: 1, q: 1, bogus: 4 })).toEqual({ a: 2, e: 1, q: 1 });
  });
  it("unlocks desk items when a row is complete", () => {
    const copper = UNLOCKS.pencil.find((x) => x.id === "copper");
    expect(isUnlocked(copper, { level: 99, feats: {} })).toBe(false);
    expect(isUnlocked(copper, { level: 0, feats: {}, rows: ["vowels"] })).toBe(true);
    expect(needs(copper, (x) => x, (id) => ROWS.find((r) => r.id === id).label)).toBe("Type case: The vowels");
  });
  it("is filled in by the progress rules, and the same way by the account", () => {
    const r = perfect("g-7");
    const out = applyResult(emptyState(), structuredClone(r), []);
    expect(out.change.sort).toBe(sortFor(r));
    expect(out.state.typecase).toEqual({ [sortFor(r)]: 1 });
    expect(out.change.feats.map((f) => f.id)).toContain("sort1");
    expect(foldResult(null, structuredClone(r), null, "2026-11-20").typecase).toEqual(out.state.typecase);
  });
});

describe("the race record", () => {
  it("counts wins, podiums, runs and years, and awards race headlines", () => {
    let r = emptyRaces(), held = {}, all = [];
    for (const o of [{ place: 1, of: 4, upset: true }, { place: 1, of: 2 }, { place: 1, of: 3 }, { place: 3, of: 3 }]) {
      const x = recordRace(r, o, 2026, held); r = x.races; all.push(...x.earned.map((e) => e.id));
      for (const e of x.earned) held[e.id] = { at: 1 };
    }
    expect(r).toMatchObject({ played: 4, wins: 3, podiums: 3, streak: 0, best: 3 });
    expect(r.years[2026]).toEqual({ played: 4, wins: 3 });
    expect(all).toEqual(["raceWin", "raceUpset", "raceWin3"]);
    expect(recordRace(emptyRaces(), { place: 1, of: 1 }, 2026).races.wins).toBe(0); // alone isn't a win
  });
  it("merges two devices' records, and folds into the account", () => {
    const a = { ...emptyRaces(), played: 5, wins: 2, years: { 2026: { played: 5, wins: 2 } } };
    const b = { ...emptyRaces(), played: 3, wins: 3, best: 3, years: { 2026: { played: 3, wins: 3 }, 2025: { played: 1, wins: 0 } } };
    expect(mergeRaces(a, b)).toMatchObject({ played: 5, wins: 3, best: 3, years: { 2026: { played: 5, wins: 3 }, 2025: { played: 1, wins: 0 } } });
    const doc = mergeExtras(null, { races: a, feats: { raceWin: { at: 3 } }, typecase: { q: 1 } });
    expect(doc).toMatchObject({ races: { wins: 2 }, feats: { raceWin: { at: 3 } }, typecase: { q: 1 } });
    expect(docFrom(doc).races.played).toBe(5);
  });
});
