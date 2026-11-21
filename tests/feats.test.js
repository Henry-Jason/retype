import { describe, it, expect } from "vitest";
import { FEATS, checkFeats, addFeats, mergeFeats, headline } from "../src/core/feats.js";
import { UNLOCKS, isUnlocked, chosen, newlyUnlocked } from "../src/core/unlocks.js";
import { applyResult, emptyState } from "../src/storage/progress-service.js";
import { foldResult, mergeGuest, emptyDoc } from "../src/core/sync.js";

const ctx = (extra = {}) => ({ totals: { galleys: 1 }, bestStreak: 0, streak: 1, level: 0, rankIndex: -1, prevWeak: {}, weak: {}, hour: 14, ...extra });
const galley = (extra = {}) => ({ id: "g" + Math.random(), kind: "normal", mode: "words", length: 25, list: "200", wordsDone: 25, wpm: 50, acc: 97, score: 47, clean: false, bestStreak: 10, at: Date.UTC(2026, 10, 21, 14), day: "2026-11-21", secs: 30, keyCount: 140, xp: null, ...extra });

describe("headlines", () => {
  it("have unique ids and something to say", () => {
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(FEATS.length);
    for (const f of FEATS) expect(f.head && f.dek && f.hint).toBeTruthy();
  });
  it("are earned by the right galleys, once", () => {
    const ids = (r, c, have) => checkFeats(have, r, ctx(c)).map((e) => e.id);
    expect(ids(galley())).toEqual(["first"]);
    expect(ids(galley({ clean: true, wordsDone: 100 }), {}, { first: { at: 1 } })).toEqual(expect.arrayContaining(["perfect10", "perfect50", "perfect100"]));
    expect(ids(galley({ wpm: 85 }), {}, { first: { at: 1 } })).toEqual(["wpm60", "wpm80"]);
    expect(ids(galley({ wpm: 85, acc: 94 }), {}, { first: { at: 1 } })).toEqual([]);
    expect(ids(galley({ mode: "survival", kind: "normal", wordsDone: 160, surv: { lives: 1 } }), {}, { first: { at: 1 } })).toEqual(["surv1k", "surv5k", "sudden100"]);
    expect(ids(galley(), { hour: 2 }, { first: { at: 1 } })).toEqual(["night"]);
    expect(ids(galley(), { streak: 7, level: 10 }, { first: { at: 1 } })).toEqual(["days7", "level10"]);
  });
  it("name the feud that ended", () => {
    const got = checkFeats({ first: { at: 1 } }, galley(), ctx({ prevWeak: { because: { trouble: 1.4 } }, weak: { because: { trouble: 0.2 } } }));
    expect(got).toEqual([{ id: "feud", d: "because" }]);
    expect(headline("feud", got[0])).toBe("Long-running feud with 'because' ends");
  });
  it("are kept, and merged between devices with the earlier one winning", () => {
    const a = addFeats({}, [{ id: "first" }], 100);
    expect(a).toEqual({ first: { at: 100 } });
    expect(mergeFeats({ first: { at: 200 }, night: { at: 5 } }, { first: { at: 100 } })).toEqual({ first: { at: 100 }, night: { at: 5 } });
  });
  it("are earned through applyResult and carried into the account document", () => {
    const out = applyResult(emptyState(), galley({ clean: true }), []);
    expect(out.change.feats.map((f) => f.id)).toEqual(expect.arrayContaining(["first", "perfect10"]));
    expect(out.state.feats.first).toBeTruthy();
    const doc = foldResult(emptyDoc(), galley({ id: "x1", clean: true }), [], "2026-11-21");
    expect(doc.feats.perfect10).toBeTruthy();
    expect(mergeGuest(emptyDoc(), { weak: {}, feats: { night: { at: 7 } } }, [], "2026-11-21").feats.night).toEqual({ at: 7 });
  });
});

describe("the desk", () => {
  it("opens with levels and headlines", () => {
    const blue = UNLOCKS.pencil.find((x) => x.id === "blue"), gold = UNLOCKS.pencil.find((x) => x.id === "gold");
    expect(isUnlocked(blue, { level: 2 })).toBe(false);
    expect(isUnlocked(blue, { level: 3 })).toBe(true);
    expect(isUnlocked(gold, { level: 99, feats: {} })).toBe(false);
    expect(isUnlocked(gold, { feats: { streak100: { at: 1 } } })).toBe(true);
  });
  it("falls back to the default for anything locked", () => {
    expect(chosen("pencil", "violet", { level: 1 }).id).toBe("red");
    expect(chosen("pencil", "violet", { level: 10 }).id).toBe("violet");
    expect(chosen("paper", "nonsense", {}).id).toBe("thermal");
  });
  it("says what a level-up just unlocked", () => {
    expect(newlyUnlocked({ level: 2, feats: {} }, { level: 3, feats: {} }).map((x) => x.label)).toEqual(["Blue pencil"]);
    expect(newlyUnlocked({ level: 4, feats: {} }, { level: 5, feats: {} }).map((x) => x.label)).toEqual(["Carbon copy"]);
  });
});
