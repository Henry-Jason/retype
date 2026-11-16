import W200 from "../src/data/words-200.js";
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openStore, memoryStore } from "../src/storage/store.js";
import { loadProgress, applyResult, record } from "../src/storage/progress-service.js";
import { buildResult, packKeys } from "../src/core/result.js";

const res = (id, at, extra = {}) => ({
  id, at, day: "2026-11-16", kind: "normal", mode: "words", length: 25, list: "200", wordsDone: 25,
  wpm: 60, acc: 98, score: 57.6, secs: 20, keyCount: 120, clean: false, ...extra
});

for (const [name, make] of [["IndexedDB", () => openStore(new IDBFactory())], ["memory", async () => memoryStore()]]) {
  describe(`store (${name})`, () => {
    it("keeps results newest first", async () => {
      const s = await make();
      await s.addResult(res("a", 1)); await s.addResult(res("b", 3)); await s.addResult(res("c", 2));
      expect((await s.recent(10)).map((r) => r.id)).toEqual(["b", "c", "a"]);
      expect((await s.recent(2)).map((r) => r.id)).toEqual(["b", "c"]);
      expect(await s.count()).toBe(3);
    });
    it("keeps small records", async () => {
      const s = await make();
      expect(await s.get("bests")).toBeUndefined();
      await s.set("bests", { x: 1 });
      expect(await s.get("bests")).toEqual({ x: 1 });
    });
  });
}

describe("progress service", () => {
  it("creates a guest profile once and keeps it", async () => {
    const s = await openStore(new IDBFactory());
    const a = await loadProgress(s), b = await loadProgress(s);
    expect(a.profile.guest).toBe(true);
    expect(b.profile.id).toBe(a.profile.id);
  });

  it("folds a result into bests, streak, totals and the weak profile", () => {
    const state = { profile: { id: "g" }, bests: {}, weak: {}, days: ["2026-11-15"], bestStreak: 1, totals: { galleys: 0, secs: 0, keys: 0, perfect: 0 }, recent: [] };
    const r = res("x", Date.now(), { day: "2026-11-16" });
    const { state: s, change } = applyResult(state, r, [{ word: "order", errs: 2, occ: 1, slow: 0 }], "2026-11-16");
    expect(change.isBest).toBe(true);
    expect(change.streak.count).toBe(2);
    expect(s.bestStreak).toBe(2);
    expect(s.totals.galleys).toBe(1);
    expect(s.weak.order.trouble).toBe(2);
    expect(s.recent[0].id).toBe("x");
  });

  it("reports a rank up when total PP crosses a line", () => {
    const words = W200.slice(0, 26);
    let state = { profile: { id: "g" }, bests: {}, weak: {}, days: [], bestStreak: 0, totals: { galleys: 0, secs: 0, keys: 0, perfect: 0 }, recent: [],
      top: [{ id: "old", pp: 190, at: 1 }] };
    const { change, state: after } = applyResult(state, res("up", 9, { wpm: 120, acc: 100, targets: words }), []);
    expect(change.rankBefore.rank.name).toBe("Copy boy");
    expect(change.pp).toBeGreaterThan(60);
    expect(change.ppAfter).toBeCloseTo(190 + 0.95 * change.pp, 1);
    expect(change.rankAfter.rank.name).toBe("Typesetter");
    expect(change.rankUp).toBe(true);
    expect(after.top.map((p) => p.id)).toEqual(["old", "up"]);
  });

  it("saves through the store", async () => {
    const s = await openStore(new IDBFactory());
    const state = await loadProgress(s);
    await record(s, state, res("saved", 5), []);
    const again = await loadProgress(s);
    expect(again.recent[0].id).toBe("saved");
    expect(again.totals.galleys).toBe(1);
  });
});

describe("result record", () => {
  it("packs keys compactly and scores the run", () => {
    const keys = [{ w: 0, pos: 0, ch: "t", ok: true, at: 0 }, { bs: true, at: 0.2 }, { w: 0, pos: 3, ch: " ", ok: true, at: 0.5, space: true }];
    expect(packKeys(keys)).toEqual([[0, 0, "t", 1, 0, 0], [-1, -1, "", 0, 200, 2], [0, 3, " ", 1, 500, 1]]);
    const r = buildResult({
      id: "i", userId: "u", at: new Date(2026, 10, 16, 10).getTime(),
      session: { targets: ["the", "cat"], keys },
      stats: { wpm: 80, raw: 85, acc: 90, errors: 1, corrections: 1, keys: 10, secs: 5, best: 1 },
      meta: { kind: "normal", mode: "words", length: 2, list: "200", wordsDone: 2 }
    });
    expect(r.score).toBeCloseTo(64.8, 5);
    expect(r.day).toBe("2026-11-16");
    expect(r.clean).toBe(false);
  });
});
