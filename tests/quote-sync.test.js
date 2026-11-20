import { describe, it, expect } from "vitest";
import { mergeSaved, recordChange, normFavs, favKeys, setFav, emptySaved, sameSaved, checkSize, SAVED_LIMITS } from "../src/core/quote-sync.js";

const q = (id, at, extra = {}) => ({ id, text: `quote ${id}`, source: "S", by: "", at, ...extra });

describe("merging two devices", () => {
  it("keeps quotes added on either side", () => {
    const m = mergeSaved({ quotes: [q("a", 1)] }, { quotes: [q("b", 2)] });
    expect(m.quotes.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("takes the later edit of the same quote", () => {
    const laptop = { quotes: [q("a", 1, { source: "Laptop", edited: 5 })] };
    const desktop = { quotes: [q("a", 1, { source: "Desktop", edited: 9 })] };
    expect(mergeSaved(laptop, desktop).quotes[0].source).toBe("Desktop");
    expect(mergeSaved(desktop, laptop).quotes[0].source).toBe("Desktop");
  });
  it("doesn't let another device bring back a deleted quote", () => {
    const here = { quotes: [], deleted: { a: 10 } };
    const there = { quotes: [q("a", 1)] };
    expect(mergeSaved(here, there).quotes).toEqual([]);
    expect(mergeSaved(there, here).quotes).toEqual([]);
  });
  it("brings a quote back if it was re-added after the deletion", () => {
    expect(mergeSaved({ deleted: { a: 10 } }, { quotes: [q("a", 20)] }).quotes.map((x) => x.id)).toEqual(["a"]);
  });
  it("lets the later favourite or un-favourite win", () => {
    const a = { favs: { k1: 5, k2: -8 } }, b = { favs: { k1: -7, k2: 6, k3: 1 } };
    const m = mergeSaved(a, b);
    expect(m.favs).toEqual({ k1: -7, k2: -8, k3: 1 });
    expect(favKeys(m.favs)).toEqual(["k3"]);
  });
  it("gives the same answer in either order, and merging again changes nothing", () => {
    const a = { quotes: [q("a", 1), q("c", 4, { edited: 6 })], deleted: { b: 3 }, favs: { k: 2 } };
    const b = { quotes: [q("b", 2), q("c", 4)], deleted: {}, favs: { k: -3, j: 1 } };
    const ab = mergeSaved(a, b), ba = mergeSaved(b, a);
    expect(ab).toEqual(ba);
    expect(mergeSaved(ab, b)).toEqual(ab);
    expect(sameSaved(ab, ba)).toBe(true);
  });
  it("reads favourites saved before syncing existed", () => {
    expect(normFavs(["x", "y", 3])).toEqual({ x: 1, y: 1 });
    expect(mergeSaved({ favs: ["x"] }, { favs: { x: -5 } }).favs).toEqual({ x: -5 });
  });
  it("keeps only the newest tombstones", () => {
    const deleted = Object.fromEntries(Array.from({ length: SAVED_LIMITS.deleted + 10 }, (_, i) => [`d${i}`, i + 1]));
    const m = mergeSaved({ deleted }, emptySaved());
    expect(Object.keys(m.deleted)).toHaveLength(SAVED_LIMITS.deleted);
    expect(m.deleted.d0).toBeUndefined();
  });
});

describe("recording changes made in this browser", () => {
  it("stamps new quotes, edits and deletions", () => {
    const start = { quotes: [q("a", 1), q("b", 2)], deleted: {}, favs: {} };
    const next = recordChange(start, [{ ...q("a", 1), source: "Fixed" }, { id: "c", text: "new one", source: "S" }], 100);
    expect(next.quotes.find((x) => x.id === "a")).toMatchObject({ source: "Fixed", at: 1, edited: 100 });
    expect(next.quotes.find((x) => x.id === "c")).toMatchObject({ at: 100 });
    expect(next.deleted).toEqual({ b: 100 });
  });
  it("leaves untouched quotes as they were", () => {
    const start = { quotes: [q("a", 1)], deleted: {}, favs: {} };
    expect(recordChange(start, [q("a", 1)], 100).quotes[0].edited).toBeUndefined();
  });
  it("turns favourites on and off with a time", () => {
    let f = setFav({}, "k", true, 50);
    expect(f).toEqual({ k: 50 });
    f = setFav(f, "k", false, 60);
    expect(favKeys(f)).toEqual([]);
  });
});

describe("size", () => {
  it("refuses a record too big for one document", () => {
    expect(checkSize({ quotes: [q("a", 1)], deleted: {}, favs: {} })).toBeNull();
    const big = { quotes: Array.from({ length: 2000 }, (_, i) => ({ ...q(`q${i}`, i), text: "x".repeat(500) })), deleted: {}, favs: {} };
    expect(checkSize(big)).toMatch(/too large/);
  });
});
