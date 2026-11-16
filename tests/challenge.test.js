import { describe, it, expect } from "vitest";
import { encodeChallenge, decodeChallenge, dailySeed, compare, DAILY } from "../src/core/challenge.js";
import { genWords } from "../src/core/words.js";
import { mulberry32 } from "../src/core/rng.js";
import { score } from "../src/core/progress.js";

const base = { seed: 123456789, mode: "words", length: 50, list: "1k", punct: true, nums: false, sudden: false };

describe("challenge links", () => {
  it("round-trip a word galley with the sender's result", () => {
    const s = encodeChallenge({ ...base, from: { name: "Henry", wpm: 87.6, acc: 96.24 } });
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeChallenge(s)).toEqual({ ...base, from: { name: "Henry", wpm: 88, acc: 96.2 } });
  });
  it("round-trip a timed galley and a script", () => {
    expect(decodeChallenge(encodeChallenge({ ...base, mode: "time", length: 30 }))).toMatchObject({ mode: "time", length: 30, from: null });
    expect(decodeChallenge(encodeChallenge({ mode: "code", snippet: "fizzbuzz" }))).toEqual({ mode: "code", snippet: "fizzbuzz", from: null });
  });
  it("keep names short and survive non-ASCII names", () => {
    const d = decodeChallenge(encodeChallenge({ ...base, from: { name: "Seán Ó Briain the very long-named", wpm: 50, acc: 99 } }));
    expect(d.from.name).toBe("Seán Ó Briain the ve");
  });
  it("reject damaged or out-of-range links", () => {
    expect(decodeChallenge("not-a-link")).toBeNull();
    expect(decodeChallenge("")).toBeNull();
    const bad = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
    expect(decodeChallenge(bad({ v: 1, m: "w", s: 1, n: 5000, l: "1k" }))).toBeNull();
    expect(decodeChallenge(bad({ v: 1, m: "w", s: 1, n: 25, l: "zz" }))).toBeNull();
    expect(decodeChallenge(bad({ v: 1, m: "c", x: "nope" }))).toBeNull();
    expect(decodeChallenge(bad({ v: 2, m: "w", s: 1, n: 25, l: "1k" }))).toBeNull();
  });
  it("give both people the same words", () => {
    const d = decodeChallenge(encodeChallenge(base));
    const mine = genWords(base.length, { rand: mulberry32(base.seed), list: base.list, punct: base.punct });
    const theirs = genWords(d.length, { rand: mulberry32(d.seed), list: d.list, punct: d.punct });
    expect(theirs).toEqual(mine);
  });
});

describe("daily galley", () => {
  it("has one seed per day, the same everywhere", () => {
    expect(dailySeed("2026-11-16")).toBe(dailySeed("2026-11-16"));
    expect(dailySeed("2026-11-16")).not.toBe(dailySeed("2026-11-17"));
    expect(Number.isInteger(dailySeed("2026-11-16"))).toBe(true);
  });
  it("is a 40-word galley from the top 1,000", () => {
    expect(DAILY).toMatchObject({ mode: "words", length: 40, list: "1k" });
  });
});

describe("compare", () => {
  it("decides by score, with a small draw band", () => {
    expect(compare({ wpm: 80, acc: 100 }, { wpm: 100, acc: 89 }, score).result).toBe("win");
    expect(compare({ wpm: 60, acc: 100 }, { wpm: 60.2, acc: 100 }, score).result).toBe("draw");
    expect(compare({ wpm: 50, acc: 90 }, { wpm: 60, acc: 95 }, score).result).toBe("loss");
  });
});
