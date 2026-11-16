import { describe, it, expect } from "vitest";
import { ppFor, ppFrom, difficulty, totalPp, addPlay, mergeTop, playOf, topFrom, rankFrom, grade, RANKS, PP_RULES, countsForPp } from "../src/core/pp.js";
import { genWords } from "../src/core/words.js";
import { mulberry32 } from "../src/core/rng.js";

const galley = (list, n, seed, extra = {}) => {
  const targets = genWords(n + 1, { rand: mulberry32(seed), list, punct: extra.punct, nums: extra.nums });
  return { id: `g${seed}`, at: seed, kind: "normal", mode: "words", length: n, list, wordsDone: n, wpm: 100, acc: 100, targets, ...extra };
};
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const avgDiff = (list, extra) => avg(Array.from({ length: 200 }, (_, i) => difficulty(galley(list, 50, i + 1, extra).targets.slice(0, 50)).value));

describe("difficulty", () => {
  it("is calibrated per word list", () => {
    expect(avgDiff("200")).toBeGreaterThan(0.8);
    expect(avgDiff("200")).toBeLessThan(0.9);
    expect(avgDiff("1k")).toBeGreaterThan(0.95);
    expect(avgDiff("1k")).toBeLessThan(1.05);
    expect(avgDiff("5k")).toBeGreaterThan(1.15);
    expect(avgDiff("5k")).toBeLessThan(1.25);
  });
  it("adds a little for punctuation and numbers", () => {
    const plain = avgDiff("1k");
    for (const extra of [{ punct: true }, { nums: true }]) {
      expect(avgDiff("1k", extra) / plain).toBeGreaterThan(1.05);
      expect(avgDiff("1k", extra) / plain).toBeLessThan(1.12);
    }
  });
  it("refuses made-up words and repetition", () => {
    expect(difficulty(["the", "zzzzqx"]).ok).toBe(false);
    expect(difficulty(Array(30).fill("extraordinary")).ok).toBe(false);
    const few = Array.from({ length: 40 }, (_, i) => ["the", "of", "and", "to", "in", "is", "it", "be", "for", "on"][i % 10]);
    expect(difficulty(few).ok).toBe(false);
    expect(difficulty(galley("200", 300, 7).targets.slice(0, 300)).ok).toBe(true); // a long time galley on the small list is fine
  });
});

describe("PP for a galley", () => {
  const typical = (wpm, acc, list = "1k", n = 50) => avg(Array.from({ length: 100 }, (_, i) => ppFor(galley(list, n, i + 1, { wpm, acc })).pp));
  it("matches the numbers on the Stats page", () => {
    expect(typical(100, 100)).toBeGreaterThan(95);
    expect(typical(100, 100)).toBeLessThan(105);
    expect(typical(150, 100) / typical(100, 100)).toBeCloseTo(1.5 ** 1.5, 5);
    expect(ppFrom({ wpm: 100, acc: 98, diff: 1, words: 50 })).toBeCloseTo(78.5, 0);
    expect(ppFrom({ wpm: 100, acc: 95, diff: 1, words: 50 })).toBeCloseTo(54, 0);
  });
  it("rewards accuracy more than speed", () => {
    expect(ppFrom({ wpm: 80, acc: 100, diff: 1, words: 50 })).toBeGreaterThan(ppFrom({ wpm: 100, acc: 96, diff: 1, words: 50 }));
  });
  it("rewards longer galleys up to 100 words", () => {
    expect(ppFrom({ wpm: 100, acc: 100, diff: 1, words: 25 })).toBeCloseTo(90, 5);
    expect(ppFrom({ wpm: 100, acc: 100, diff: 1, words: 100 })).toBeCloseTo(120, 5);
    expect(ppFrom({ wpm: 100, acc: 100, diff: 1, words: 400 })).toBeCloseTo(120, 5);
  });
  it("only counts ordinary galleys", () => {
    expect(ppFor(galley("1k", 50, 1, { kind: "practice" })).ok).toBe(false);
    expect(ppFor(galley("1k", 50, 1, { sudden: true })).ok).toBe(false);
    expect(ppFor(galley("1k", 10, 1)).ok).toBe(false);
    expect(ppFor(galley("1k", 40, 1, { kind: "daily" })).ok).toBe(true);
    expect(countsForPp({ kind: "code", mode: "code", wordsDone: 50 })).toBe(false);
  });
  it("uses the server's numbers when given them", () => {
    const g = galley("1k", 50, 3, { wpm: 200, acc: 100 });
    const honest = ppFor(g, { wpm: 100, acc: 100, words: 50 });
    expect(honest.pp).toBeCloseTo(ppFor({ ...g, wpm: 100 }).pp, 6);
    expect(ppFor(g, { wpm: 100, acc: 100, words: 20 }).words).toBe(20);
  });
});

describe("total PP", () => {
  const play = (id, pp) => ({ id, pp, at: 0 });
  it("weights each lower play by 0.95", () => {
    expect(totalPp([play("a", 100), play("b", 100), play("c", 100)])).toBeCloseTo(100 + 95 + 90.25, 6);
    // 100 plays of 100 approach 100 / 0.05
    const many = Array.from({ length: 150 }, (_, i) => play(`p${i}`, 100)).reduce(addPlay, []);
    expect(many.length).toBe(PP_RULES.top);
    expect(totalPp(many)).toBeCloseTo(100 * (1 - 0.95 ** 100) / 0.05, 6);
  });
  it("keeps one play per galley, best first, and ignores zero", () => {
    let top = addPlay([], play("a", 50));
    top = addPlay(top, play("b", 80));
    top = addPlay(top, play("a", 50));
    top = addPlay(top, play("z", 0));
    expect(top.map((p) => p.id)).toEqual(["b", "a"]);
    expect(mergeTop(top, [play("c", 60), play("b", 80)]).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });
  it("rebuilds from stored galleys", () => {
    const rs = [galley("1k", 50, 1), galley("1k", 50, 2, { wpm: 60 }), galley("1k", 50, 3, { kind: "practice" })];
    const top = topFrom(rs);
    expect(top.map((p) => p.id)).toEqual(["g1", "g2"]);
    expect(top[0]).toMatchObject(playOf(rs[0], top[0].pp));
  });
});

describe("ranks and grades", () => {
  it("go by total PP", () => {
    expect(rankFrom([])).toMatchObject({ rank: null });
    expect(rankFrom([{ id: "a", pp: 10 }]).rank.name).toBe("Copy boy");
    const r = rankFrom([{ id: "a", pp: 500 }]);
    expect(r.rank.name).toBe("Compositor");
    expect(r.next.name).toBe("Proofreader");
    expect(r.progress).toBe(0);
    const top = rankFrom([{ id: "a", pp: 5000 }]);
    expect(top.rank).toBe(RANKS[RANKS.length - 1]);
    expect(top.progress).toBe(1);
  });
  it("grade accuracy like osu", () => {
    expect(grade(100)).toBe("SS");
    expect(grade(99.9)).toBe("S");
    expect(grade(98)).toBe("S");
    expect(grade(97)).toBe("A");
    expect(grade(91)).toBe("B");
    expect(grade(85)).toBe("C");
    expect(grade(40)).toBe("D");
  });
});
