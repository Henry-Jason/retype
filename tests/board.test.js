import { describe, it, expect, beforeAll } from "vitest";
import { mulberry32 } from "../src/core/rng.js";
import { genWords } from "../src/core/words.js";
import { dailySeed } from "../src/core/challenge.js";
import { packKeys } from "../src/core/result.js";
import { analyse } from "../src/core/analysis.js";

// The Cloud Function's decision, tested against the shared code it ships with.
let boardEntry;
beforeAll(async () => {
  ({ boardEntry } = await import("../functions/board.js"));
});

const day = "2026-11-16", AT = Date.UTC(2026, 10, 16, 12);
function daily(extra = {}) {
  const targets = genWords(40, { rand: mulberry32(dailySeed(day)), list: "1k" });
  const keys = []; let t = 0;
  targets.forEach((w, i) => {
    [...w].forEach((ch, pos) => keys.push({ w: i, pos, ch, ok: true, at: (t += 0.09) }));
    if (i < targets.length - 1) keys.push({ w: i, pos: w.length, ch: " ", ok: true, space: true, at: (t += 0.09) });
  });
  const s = { keys, targets, typed: targets.slice(), cur: 39, total: keys.length, okKeys: keys.length, best: 40 };
  const r = analyse(s, t);
  return { id: "r1", userId: "ana", at: AT, day, kind: "daily", mode: "words", list: "1k", seed: dailySeed(day), wordsDone: 40,
    punct: false, nums: false, sudden: false, clean: true, targets, keys: JSON.stringify(packKeys(keys)), secs: t, wpm: r.wpm, acc: r.acc, keyCount: r.keys, ...extra };
}

describe("posting a daily to the board", () => {
  it("posts an honest daily with the recomputed numbers and the display name", () => {
    const out = boardEntry({ uid: "ana", rid: "r1", result: daily(), name: "Ana", now: AT + 60000 });
    expect(out.ok).toBe(true);
    expect(out.entry).toMatchObject({ uid: "ana", name: "Ana", acc: 100, resultId: "r1", clean: true });
    expect(out.entry.wpm).toBeGreaterThan(100);
  });
  it("falls back to an anonymous name", () => {
    expect(boardEntry({ uid: "ana", rid: "r1", result: daily(), name: null, now: AT }).entry.name).toBe("Anonymous typist");
  });
  it("refuses results filed under another account, stale ones and doctored ones", () => {
    expect(boardEntry({ uid: "ben", rid: "r1", result: daily(), now: AT }).ok).toBe(false);
    expect(boardEntry({ uid: "ana", rid: "r1", result: daily(), now: AT + 3 * 86400000 }).ok).toBe(false);
    const d = daily();
    expect(boardEntry({ uid: "ana", rid: "r1", result: { ...d, wpm: d.wpm + 40 }, now: AT }).ok).toBe(false);
  });
});
