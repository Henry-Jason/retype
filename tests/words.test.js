import { describe, it, expect } from "vitest";
import { mulberry32 } from "../src/core/rng.js";
import { genWords, decorate, norm, shuffleSpread, LISTS, pairDrill } from "../src/core/words.js";

describe("seeded generation", () => {
  it("gives the same galley for the same seed", () => {
    const a = genWords(50, { rand: mulberry32(42) }), b = genWords(50, { rand: mulberry32(42) });
    expect(a).toEqual(b);
    expect(genWords(50, { rand: mulberry32(43) })).not.toEqual(a);
  });
  it("never repeats a word twice in a row", () => {
    const w = genWords(500, { rand: mulberry32(1) });
    expect(w).toHaveLength(500);
    for (let i = 1; i < w.length; i++) expect(w[i]).not.toBe(w[i - 1]);
  });
  it("draws from the chosen list", () => {
    const set = new Set(LISTS["5k"].words);
    for (const w of genWords(200, { rand: mulberry32(7), list: "5k" })) expect(set.has(w)).toBe(true);
  });
  it("mixes in weak words at roughly the asked share", () => {
    const weak = ["zzzweak"];
    const w = genWords(4000, { rand: mulberry32(9), weak, ratio: 0.4 });
    const share = w.filter((x) => x === "zzzweak").length / w.length;
    // the no-repeat rule pulls it a little under the raw ratio
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.45);
  });
});

describe("word lists", () => {
  it("has the advertised sizes and only plain lowercase words", () => {
    expect(LISTS["200"].words.length).toBe(200);
    expect(LISTS["1k"].words.length).toBe(1000);
    expect(LISTS["5k"].words.length).toBeGreaterThan(4990);
    for (const key of ["1k", "5k"]) for (const w of LISTS[key].words) expect(w).toMatch(/^[a-z]+$/);
  });
  it("has no duplicates", () => {
    for (const key of Object.keys(LISTS)) expect(new Set(LISTS[key].words).size).toBe(LISTS[key].words.length);
  });
});

describe("punctuation and numbers", () => {
  it("capitalises the first word and ends with a full stop", () => {
    const w = decorate(["the", "cat", "sat"], { rand: mulberry32(3), punct: true });
    expect(w[0][0]).toBe("T");
    expect(w[w.length - 1].endsWith(".")).toBe(true);
  });
  it("capitalises after a sentence ends", () => {
    const w = decorate(Array(300).fill("word"), { rand: mulberry32(5), punct: true });
    for (let i = 1; i < w.length; i++) if (/[.?]$/.test(w[i - 1])) expect(w[i][0]).toBe("W");
  });
  it("leaves words alone when both are off", () => {
    const list = ["a", "b"];
    expect(decorate(list, { rand: mulberry32(1) })).toBe(list);
  });
  it("normalises punctuation and case away for grouping", () => {
    expect(norm("Order,")).toBe("order");
    expect(norm("don't")).toBe("don't");
  });
});

describe("shuffleSpread", () => {
  it("keeps the same words and spreads repeats apart", () => {
    const words = ["a", "a", "a", "b", "b", "b", "c", "c", "c"];
    const out = shuffleSpread(words, mulberry32(11));
    expect([...out].sort()).toEqual([...words].sort());
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
  });
});

describe("pair drill", () => {
  it("builds words containing the slow pairs", () => {
    const d = pairDrill(["th", "er"], { rand: mulberry32(2) });
    expect(d.words).toHaveLength(30);
    for (const w of d.words) expect(w.includes("th") || w.includes("er")).toBe(true);
  });
  it("gives up when no words fit", () => {
    expect(pairDrill(["qz"], { rand: mulberry32(2) })).toBeNull();
  });
});
