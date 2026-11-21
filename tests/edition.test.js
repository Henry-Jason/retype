import { describe, it, expect } from "vitest";
import { buildEdition, weekStart, weekKey, wordOfWeek } from "../src/core/edition.js";

const MON = new Date(2026, 10, 16, 0, 0).getTime(); // Monday 16 November 2026, local
const H = 3600000;
const g = (at, extra = {}) => ({ id: "g" + at, at, day: "d" + Math.floor(at / 86400000), kind: "normal", mode: "words", wordsDone: 25, wpm: 60, acc: 96, score: 55, keyCount: 150, secs: 30, clean: false, targets: ["because", "the"], keys: [], ...extra });

describe("weeks", () => {
  it("start on Monday", () => {
    expect(weekStart(MON + 3 * 24 * H + 5 * H)).toBe(MON);
    expect(weekStart(MON + 6 * 24 * H + 23 * H)).toBe(MON);
    expect(weekKey(MON)).toBe("2026-11-16");
  });
});

describe("the edition", () => {
  it("is quiet with nothing typed", () => {
    expect(buildEdition([], MON).quiet).toBe(true);
  });
  it("adds up the week and compares it with the one before", () => {
    const rs = [g(MON + 10 * H), g(MON + 34 * H, { acc: 98, wpm: 70, score: 67 }), g(MON - 20 * H, { acc: 90 }), g(MON + 8 * 24 * H)];
    const e = buildEdition(rs, MON, { name: "Henry" });
    expect(e.stats.galleys).toBe(2);
    expect(e.stats.days).toBe(2);
    expect(e.stats.acc).toBeCloseTo(97, 6);
    expect(e.prev.acc).toBe(90);
    expect(e.best.wpm).toBe(70);
    expect(e.lead).toBe("HENRY posts 70 wpm at 98.0%");
  });
  it("leads with a long survival run", () => {
    const e = buildEdition([g(MON + H, { mode: "survival", wordsDone: 212 })], MON, { name: "Henry" });
    expect(e.lead).toBe("HENRY survives 212 words");
  });
  it("finds the word of the week from the keystrokes", () => {
    const keys = [[0, 1, "x", 0, 100, 0], [0, 2, "x", 0, 200, 0], [1, 0, "x", 0, 300, 0], [0, 3, "", 0, 400, 2]];
    expect(wordOfWeek([g(MON, { keys })])).toEqual({ word: "because", misses: 2 });
    expect(wordOfWeek([g(MON, { keys: keys.slice(2) })])).toBe(null);
  });
  it("lists the headlines made that week", () => {
    const e = buildEdition([g(MON + H)], MON, { feats: { first: { at: MON + H }, night: { at: MON - H } } });
    expect(e.feats).toEqual(["Local typist files first galley"]);
  });
  it("numbers editions from your first galley", () => {
    expect(buildEdition([g(MON + H)], MON, { first: MON - 14 * 24 * H }).no).toBe(3);
  });
});
