import { describe, it, expect } from "vitest";
import { mulberry32 } from "../src/core/rng.js";
import { LISTS } from "../src/core/words.js";
import { SURVIVAL, REGIONS, regionAt, regionStart, survivalWords, rollingWpm, loseLife, afterCleanWord, survivalOpts, survivalLabel } from "../src/core/survival.js";
import { modeKey, updateBests } from "../src/core/progress.js";
import { countsForPp, difficulty } from "../src/core/pp.js";
import { bestLabel, resultLabel } from "../src/ui/stats.js";

describe("the 10k list", () => {
  const W10 = LISTS["10k"].words, W5 = LISTS["5k"].words;
  it("is 10,000 plain lowercase words with the 5k list as its first half", () => {
    expect(W10).toHaveLength(10000);
    expect(new Set(W10).size).toBe(10000);
    for (const w of W10) expect(w).toMatch(/^[a-z]+$/);
    expect(W10.slice(0, 5000)).toEqual(W5);
  });
  it("leaves the difficulty of top-5,000 galleys exactly as it was", () => {
    // ranks 0..4999 are unchanged, so a 5k word scores as it always did; "govern" stays a rare one
    const a = difficulty(["the", "govern", "people", "however", "system"]);
    expect(a.ok).toBe(true);
    expect(a.value).toBeCloseTo(((0.267 + 0.0858 * Math.log2(2)) + (0.267 + 0.0858 * Math.log2(5002)) + [W5.indexOf("people"), W5.indexOf("however"), W5.indexOf("system")].reduce((s, r) => s + 0.267 + 0.0858 * Math.log2(r + 2), 0)) / 5, 9);
  });
  it("scores the new words as harder than the top 5,000", () => {
    const hard = difficulty(W10.slice(9000, 9050)), easy = difficulty(W5.slice(4000, 4050));
    expect(hard.ok).toBe(true);
    expect(hard.value).toBeGreaterThan(easy.value);
  });
});

describe("regions", () => {
  it("starts on the top 1,000 and works up to the top 10,000", () => {
    expect(regionAt(0).list).toBe("1k");
    expect(regionAt(99).list).toBe("1k");
    expect(regionAt(100).list).toBe("5k");
    expect(regionAt(299).list).toBe("5k");
    expect(regionAt(300).list).toBe("10k");
    expect(regionAt(5000).list).toBe("10k");
  });
  it("marks only the first word of each region", () => {
    expect(REGIONS.map((r) => regionStart(r.at))).toEqual(["1K region", "5K region", "10K region"]);
    expect(regionStart(1)).toBe(null);
    expect(regionStart(101)).toBe(null);
  });
  it("draws each word from its region's list, without punctuation or numbers by default", () => {
    const w = survivalWords(0, 400, { rand: mulberry32(3) });
    expect(w).toHaveLength(400);
    const k1 = new Set(LISTS["1k"].words), k5 = new Set(LISTS["5k"].words), k10 = new Set(LISTS["10k"].words);
    w.forEach((x, i) => {
      expect(x).toMatch(/^[a-z]+$/);
      expect((i < 100 ? k1 : i < 300 ? k5 : k10).has(x)).toBe(true);
    });
    for (let i = 1; i < w.length; i++) expect(w[i]).not.toBe(w[i - 1]);
  });
  it("carries on from any point, never repeating the word before", () => {
    const rand = mulberry32(5), first = survivalWords(0, 80, { rand });
    const more = survivalWords(80, 50, { rand, prev: first[79] });
    expect(more[0]).not.toBe(first[79]);
    expect(new Set(LISTS["5k"].words).has(more[30])).toBe(true); // word 110
  });
  it("is the same run for the same seed", () => {
    expect(survivalWords(0, 150, { rand: mulberry32(9) })).toEqual(survivalWords(0, 150, { rand: mulberry32(9) }));
  });
  it("adds punctuation and numbers only when asked", () => {
    const w = survivalWords(0, 200, { rand: mulberry32(4), punct: true, nums: true });
    expect(w.some((x) => /[.,?]/.test(x))).toBe(true);
    expect(w.some((x) => /^\d+[.,?]?$/.test(x))).toBe(true);
  });
});

describe("lives", () => {
  it("loses one a key and never goes below none", () => {
    expect(loseLife(3)).toBe(2);
    expect(loseLife(0)).toBe(0);
  });
  it("gives one back after 50 clean words with regen on, up to the start", () => {
    let s = { lives: 2, run: 0 };
    for (let i = 0; i < 49; i++) s = afterCleanWord({ ...s, max: 3, regen: true });
    expect(s.lives).toBe(2);
    s = afterCleanWord({ ...s, max: 3, regen: true });
    expect(s).toMatchObject({ lives: 3, run: 0, regained: true });
    for (let i = 0; i < 60; i++) s = afterCleanWord({ ...s, max: 3, regen: true });
    expect(s.lives).toBe(3);
    expect(afterCleanWord({ lives: 1, run: 49, max: 3, regen: false }).lives).toBe(1);
  });
  it("reads only the allowed settings", () => {
    expect(survivalOpts({ survLives: 5, survRegen: true, survFloor: 40 })).toEqual({ lives: 5, regen: true, floor: 40 });
    expect(survivalOpts({ survLives: 7, survFloor: 33 })).toEqual({ lives: 3, regen: false, floor: 0 });
    expect(survivalLabel({ lives: 1, regen: false, floor: 0 })).toBe("1 life");
    expect(survivalLabel({ lives: 3, regen: true, floor: 30 })).toBe("3 lives · regen · floor 30 wpm");
  });
});

describe("speed floor", () => {
  const lens = Array(30).fill(4); // 4 letters + a space = one "word" of 5 keys
  it("waits for 10 words", () => {
    expect(rollingWpm({ commits: [1, 2, 3], lens, now: 3 })).toBe(null);
  });
  it("is words per minute over the last 10, counting the time since", () => {
    const commits = Array.from({ length: 12 }, (_, i) => i + 1); // a word a second
    expect(rollingWpm({ commits, lens, now: 12 })).toBeCloseTo(60, 6);
    // stalling 10 more seconds halves it
    expect(rollingWpm({ commits, lens, now: 22 })).toBeCloseTo(30, 6);
  });
  it("starts again after a life is lost to it", () => {
    const commits = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(rollingWpm({ commits, lens, since: 10, sinceAt: 10, now: 15 })).toBe(null);
    const more = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(rollingWpm({ commits: more, lens, since: 10, sinceAt: 10, now: 20 })).toBeCloseTo(60, 6);
  });
});

describe("survival galleys", () => {
  const run = (words, extra = {}) => ({ id: "r" + words, kind: "normal", mode: "survival", length: null, list: null, punct: false, nums: false, sudden: false, wordsDone: words, wpm: 60, acc: 97, score: 56, at: 1, surv: { lives: 3, regen: false, floor: 30, left: 0 }, ...extra });
  it("keep a best per lives, regen and floor", () => {
    expect(modeKey(run(50))).toBe("survival 3l floor30");
    expect(modeKey(run(50, { surv: { lives: 1, regen: true, floor: 0 } }))).toBe("survival 1l regen");
    expect(modeKey(run(50, { punct: true }))).toBe("survival 3l floor30 punct");
  });
  it("judge bests by how far you got, then by score", () => {
    let u = updateBests({}, run(120));
    expect(u.isBest).toBe(true);
    expect(u.bests[u.key].words).toBe(120);
    u = updateBests(u.bests, run(119, { score: 99 }));
    expect(u.isBest).toBe(false);
    u = updateBests(u.bests, run(120, { score: 60, id: "x" }));
    expect(u.isBest).toBe(true);
    expect(updateBests({}, run(9)).isBest).toBe(false);
  });
  it("don't earn PP", () => {
    expect(countsForPp(run(500))).toBe(false);
  });
  it("read nicely on the Stats page", () => {
    expect(bestLabel("survival 3l regen floor30")).toBe("survival · 3 lives · regen · floor 30 wpm");
    expect(resultLabel(run(212))).toBe("survival · 212 words · 3 lives · floor 30 wpm");
  });
  it("stop before a stored galley would get too big", () => {
    expect(SURVIVAL.maxWords).toBeLessThan(2000);
  });
});
