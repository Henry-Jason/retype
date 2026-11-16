import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mulberry32 } from "../src/core/rng.js";
import { genWords } from "../src/core/words.js";
import { packKeys } from "../src/core/result.js";
import { analyse } from "../src/core/analysis.js";
import { ppFor, totalPp } from "../src/core/pp.js";

// The PP Cloud Function's decisions, tested against the shared code it ships with.
let ppPlay, nextEntry;
beforeAll(async () => {
  execFileSync("node", ["scripts/sync-functions.mjs"]);
  ({ ppPlay, nextEntry } = await import("../functions/pp.js"));
});

const AT = Date.UTC(2026, 10, 16, 12);
/**
 * Type a galley: every `slip`-th word gets one wrong letter, left unfixed. With `secs`, it's a
 * time galley cut off when the clock runs out, mid-word.
 */
function galley({ id = "g1", list = "1k", n = 50, seed = 1, slip = 0, secs = null, gap = 0.07, extra = {} } = {}) {
  const targets = genWords(n + 1, { rand: mulberry32(seed), list });
  const keys = [], typed = targets.map(() => "");
  let t = 0, cur = 0, total = 0, okKeys = 0;
  const press = (k) => { if (secs != null && t + gap > secs) return false; t += gap; keys.push({ ...k, at: t }); total++; if (k.ok) okKeys++; return true; };
  outer: for (let i = 0; i < (secs != null ? targets.length : n); i++) {
    cur = i;
    const w = targets[i];
    for (let pos = 0; pos < w.length; pos++) {
      const wrong = slip && i % slip === slip - 1 && pos === 0;
      const ch = wrong ? (w[0] === "x" ? "y" : "x") : w[pos];
      if (!press({ w: i, pos, ch, ok: !wrong })) break outer;
      typed[i] += ch;
    }
    if (i < (secs != null ? targets.length : n) - 1 && !press({ w: i, pos: w.length, ch: " ", ok: true, space: true })) break;
  }
  const time = secs ?? t;
  const s = { keys, targets: targets.slice(0, secs != null ? cur + 1 : n), typed, cur, total, okKeys, best: 0 };
  const r = analyse(s, time);
  const wordsDone = secs != null ? cur : n;
  return {
    id, userId: "ana", at: AT, day: "2026-11-16", kind: "normal", mode: secs != null ? "time" : "words", length: secs ?? n, list,
    punct: false, nums: false, sudden: false, wordsDone, targets: targets.slice(0, wordsDone + 1),
    keys: JSON.stringify(packKeys(keys)), secs: time, wpm: r.wpm, acc: r.acc, keyCount: r.keys, clean: r.errors === 0
  };
}

describe("scoring a galley for the PP board", () => {
  it("scores an honest words galley the same as the browser", () => {
    const g = galley({ slip: 9 });
    const out = ppPlay({ uid: "ana", rid: "g1", result: g, now: AT + 1000 });
    expect(out.ok, out.reason).toBe(true);
    expect(out.play.pp).toBeCloseTo(ppFor(g).pp, 1);
    expect(out.play.acc).toBeLessThan(100);
  });
  it("scores an honest time galley cut off mid-word", () => {
    const g = galley({ secs: 30, list: "5k", seed: 4 });
    expect(g.mode).toBe("time");
    const out = ppPlay({ uid: "ana", rid: "g1", result: g, now: AT });
    expect(out.ok, out.reason).toBe(true);
    expect(out.play.pp).toBeCloseTo(ppFor(g).pp, 0);
  });
  it("counts old galleys too (guest galleys uploaded at sign-in)", () => {
    expect(ppPlay({ uid: "ana", rid: "g1", result: galley(), now: AT + 400 * 86400000 }).ok).toBe(true);
  });
  it("ignores galleys that don't earn PP, quietly", () => {
    const out = ppPlay({ uid: "ana", rid: "g1", result: { ...galley(), kind: "practice" }, now: AT });
    expect(out).toMatchObject({ ok: false, quiet: true });
  });
  it("refuses doctored galleys", () => {
    const g = galley();
    expect(ppPlay({ uid: "ben", rid: "g1", result: g, now: AT }).ok).toBe(false);
    expect(ppPlay({ uid: "ana", rid: "g1", result: { ...g, wpm: g.wpm * 1.5 }, now: AT }).ok).toBe(false);
    const sloppy = galley({ slip: 5 });
    expect(ppPlay({ uid: "ana", rid: "g1", result: sloppy, now: AT }).ok).toBe(true);
    expect(ppPlay({ uid: "ana", rid: "g1", result: { ...sloppy, acc: 100 }, now: AT }).ok).toBe(false);
    expect(ppPlay({ uid: "ana", rid: "g1", result: g, now: AT - 2 * 3600000 }).ok).toBe(false); // from the future
    // swapping in rarer words after the fact breaks the keystroke log
    const harder = genWords(51, { rand: mulberry32(1), list: "5k" });
    expect(ppPlay({ uid: "ana", rid: "g1", result: { ...g, targets: harder }, now: AT }).ok).toBe(false);
    // claiming more words than the log reaches doesn't raise the length bonus
    const more = ppPlay({ uid: "ana", rid: "g1", result: { ...g, wordsDone: 200 }, now: AT });
    expect(more.ok ? more.play.pp : 0).toBeCloseTo(ppPlay({ uid: "ana", rid: "g1", result: g, now: AT }).play.pp, 6);
  });
});

describe("the board entry", () => {
  const play = (id, pp) => ({ id, pp, at: 0, wpm: 100, acc: 100 });
  it("keeps the top plays and the weighted total", () => {
    let e = nextEntry({ uid: "ana", cur: null, plays: [play("a", 100)], name: "Ana", now: 1 });
    e = nextEntry({ uid: "ana", cur: e, plays: [play("b", 50), play("a", 100)], name: null, now: 2 });
    expect(e).toMatchObject({ uid: "ana", name: "Ana", count: 2, best: 100, backfilled: false });
    expect(e.pp).toBeCloseTo(totalPp([play("a", 100), play("b", 50)]), 2);
  });
  it("remembers a backfill", () => {
    const e = nextEntry({ uid: "ana", cur: null, plays: [], name: "Ana", now: 1, backfilled: true });
    expect(nextEntry({ uid: "ana", cur: e, plays: [play("c", 10)], name: "Ana", now: 2 }).backfilled).toBe(true);
  });
});
