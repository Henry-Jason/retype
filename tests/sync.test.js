import { describe, it, expect } from "vitest";
import { emptyDoc, docFrom, foldResult, mergeWeak, mergeRecent, mergeGuest, capWeak, toCloud, fromCloud } from "../src/core/sync.js";

const res = (id, at, extra = {}) => ({
  id, at, day: "2026-11-16", kind: "normal", mode: "words", length: 25, list: "200", wordsDone: 25,
  wpm: 60, acc: 98, score: 57.6, secs: 20, keyCount: 120, clean: false, keys: [[0, 0, "t", 1, 0, 0]], ...extra
});

describe("folding a galley into the account", () => {
  it("updates totals, days, bests and weak words", () => {
    const d = foldResult(emptyDoc(), res("a", 1), [{ word: "order", errs: 2, occ: 1, slow: 0 }], "2026-11-16");
    expect(d.totals).toEqual({ galleys: 1, secs: 20, keys: 120, perfect: 0 });
    expect(d.days).toEqual(["2026-11-16"]);
    expect(d.bests["25w 200"].score).toBe(57.6);
    expect(d.weak.order.trouble).toBe(2);
    expect(d.bestStreak).toBe(1);
    expect(d).not.toHaveProperty("recent");
  });
  it("never counts the same galley twice", () => {
    const once = foldResult(emptyDoc(), res("a", 1), [], "2026-11-16");
    const twice = foldResult(once, res("a", 1), [], "2026-11-16");
    expect(twice.totals.galleys).toBe(1);
    expect(twice.folded).toEqual(["a"]);
    expect(mergeGuest(once, { weak: {} }, [res("a", 1), res("b", 2)], "2026-11-16").totals.galleys).toBe(2);
  });
  it("leaves weak words alone when the breakdown isn't known", () => {
    const start = { ...emptyDoc(), weak: { cat: { trouble: 1, seen: 1, last: 0 } } };
    expect(foldResult(start, res("a", 1), null, "2026-11-16").weak).toEqual(start.weak);
  });
  it("copes with a missing or partial document", () => {
    expect(foldResult(undefined, res("a", 1), [], "2026-11-16").totals.galleys).toBe(1);
    expect(docFrom({ totals: { galleys: 3 } }).totals).toEqual({ galleys: 3, secs: 0, keys: 0, perfect: 0 });
  });
});

describe("merging", () => {
  it("keeps the most recently updated weak-word entry", () => {
    const a = { cat: { trouble: 2, seen: 4, last: 10 }, dog: { trouble: 1, seen: 1, last: 5 } };
    const b = { cat: { trouble: 0.1, seen: 6, last: 20 }, eel: { trouble: 3, seen: 1, last: 1 } };
    const m = mergeWeak(a, b);
    expect(m.cat.trouble).toBe(0.1);
    expect(Object.keys(m).sort()).toEqual(["cat", "dog", "eel"]);
  });
  it("caps the weak profile by recency", () => {
    const w = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`w${i}`, { trouble: 1, seen: 1, last: i }]));
    expect(Object.keys(capWeak(w, 3)).sort()).toEqual(["w7", "w8", "w9"]);
  });
  it("merges recent galleys without duplicates, newest first", () => {
    const m = mergeRecent([res("a", 1), res("b", 3)], [res("b", 3), res("c", 2)], 60);
    expect(m.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(mergeRecent([res("a", 1), res("b", 2)], [], 1).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("signing in with guest galleys", () => {
  const account = { ...emptyDoc(), totals: { galleys: 10, secs: 200, keys: 1000, perfect: 1 }, days: ["2026-11-14", "2026-11-15"], bestStreak: 2,
    bests: { "25w 200": { score: 50, wpm: 50, acc: 100, at: 0, id: "old" } }, weak: { cat: { trouble: 1, seen: 3, last: 5 } } };
  const local = { weak: { dog: { trouble: 2, seen: 1, last: 7 } }, bestStreak: 5 };
  it("adds the guest galleys to the account's totals, days and bests", () => {
    const m = mergeGuest(account, local, [res("g2", 20, { score: 70, wpm: 70, acc: 100 }), res("g1", 10)], "2026-11-16");
    expect(m.totals.galleys).toBe(12);
    expect(m.totals.secs).toBe(240);
    expect(m.days).toEqual(["2026-11-14", "2026-11-15", "2026-11-16"]);
    expect(m.bests["25w 200"].id).toBe("g2");
    expect(m.bestStreak).toBe(5);
    expect(Object.keys(m.weak).sort()).toEqual(["cat", "dog"]);
  });
  it("changes nothing but weak words and streak when there's nothing pending", () => {
    const m = mergeGuest(account, { weak: {}, bestStreak: 0 }, [], "2026-11-16");
    expect(m.totals).toEqual(account.totals);
    expect(m.weak).toEqual(account.weak);
  });
});

describe("cloud copy of a galley", () => {
  it("stores the keystroke log as a string under the account's id and reads it back", () => {
    const r = res("a", 1, { userId: "guest", keys: [[0, 0, "t", 1, 0, 0], [-1, -1, "", 0, 200, 2]] });
    const c = toCloud(r, "uid1");
    expect(c.userId).toBe("uid1");
    expect(typeof c.keys).toBe("string");
    expect(fromCloud(c).keys).toEqual(r.keys);
    expect(fromCloud({ ...c, keys: "not json" }).keys).toEqual([]);
  });
});
