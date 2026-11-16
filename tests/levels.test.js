import { describe, it, expect } from "vitest";
import { xpFor, levelFrom, xpForLevel, xpToNext, legacyXp } from "../src/core/levels.js";

const r = (extra = {}) => ({ kind: "normal", mode: "words", keyCount: 150, acc: 100, wpm: 60, wordsDone: 25, clean: false, ...extra });
const get = (x, label) => (x.parts.find(([l]) => l === label) || [, 0])[1];

describe("xpFor", () => {
  it("pays for correct typing", () => {
    expect(get(xpFor(r({ acc: 90, keyCount: 100 })), "typing")).toBe(18); // 90 correct keys = 18 words
  });
  it("adds an accuracy bonus by threshold", () => {
    expect(get(xpFor(r({ acc: 100 })), "accuracy")).toBe(15);  // 50% of 30
    expect(get(xpFor(r({ acc: 98.5 })), "accuracy")).toBe(7);  // 25% of 29
    expect(get(xpFor(r({ acc: 96 })), "accuracy")).toBe(3);    // 10% of 28
    expect(get(xpFor(r({ acc: 94 })), "accuracy")).toBe(0);
  });
  it("adds speed, perfect, best, rank, daily and first-of-day bonuses", () => {
    const x = xpFor(r({ clean: true, wpm: 87 }), { isBest: true, rankUp: true, dailyFirst: true, firstOfDay: true, streak: 4 });
    expect(get(x, "speed")).toBe(8);
    expect(get(x, "perfect")).toBe(25);
    expect(get(x, "personal best")).toBe(50);
    expect(get(x, "rank up")).toBe(100);
    expect(get(x, "daily")).toBe(30);
    expect(get(x, "first of the day")).toBe(35);
    expect(x.total).toBe(x.parts.reduce((s, [, n]) => s + n, 0));
  });
  it("counts speed up to 200 wpm", () => {
    expect(get(xpFor(r({ wpm: 900 })), "speed")).toBe(20);
  });
  it("caps the streak bonus at a week", () => {
    expect(get(xpFor(r(), { firstOfDay: true, streak: 40 }), "first of the day")).toBe(50);
  });
  it("gives short galleys typing XP only", () => {
    const x = xpFor(r({ wordsDone: 4, keyCount: 20, clean: true }), { isBest: true, firstOfDay: true });
    expect(x.parts.map(([l]) => l)).toEqual(["typing"]);
  });
  it("gives no speed XP for flow or practice", () => {
    expect(get(xpFor(r({ mode: "flow" })), "speed")).toBe(0);
    expect(get(xpFor(r({ kind: "practice", mode: "practice" })), "speed")).toBe(0);
  });
});

describe("levels", () => {
  it("starts at level 0 and needs a little more XP each level", () => {
    expect(levelFrom(0)).toMatchObject({ level: 0, into: 0, need: 100 });
    expect(levelFrom(99).level).toBe(0);
    expect(levelFrom(100).level).toBe(1);
    expect(xpToNext(1)).toBe(120);
    expect(levelFrom(219).level).toBe(1);
    expect(levelFrom(220).level).toBe(2);
  });
  it("matches the closed form at every level and has no top", () => {
    for (let n = 0; n < 500; n++) {
      expect(levelFrom(xpForLevel(n)).level).toBe(n);
      expect(levelFrom(xpForLevel(n + 1) - 1).level).toBe(n);
    }
    expect(levelFrom(1e9).level).toBeGreaterThan(9000);
  });
  it("reports progress through the level", () => {
    expect(levelFrom(160).progress).toBeCloseTo(0.5, 5);
  });
  it("estimates XP for galleys typed before levels", () => {
    expect(legacyXp({ keys: 1003 })).toBe(201);
    expect(legacyXp(undefined)).toBe(0);
  });
});
