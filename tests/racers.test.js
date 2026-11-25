import { describe, it, expect } from "vitest";
import { GHOSTS, quickKind, poolEntry, pickGhosts, houseGhosts, raceGhosts, ghostTrack, ghostRun, withGhosts } from "../src/core/racers.js";
import { standings, roundOver, QUICK } from "../src/core/room.js";
import { mulberry32 } from "../src/core/rng.js";

// "the cat", one key every 100ms
const keys = [[0, 0, "t", 1, 0, 0], [0, 1, "h", 1, 100, 0], [0, 2, "e", 1, 200, 0], [0, 3, " ", 1, 300, 1], [1, 0, "c", 1, 400, 0], [1, 1, "a", 1, 500, 0], [1, 2, "t", 1, 600, 0]];
const run = (extra = {}) => ({ name: "Ana", wpm: 60, acc: 98, words: 2, secs: 0.6, keys: JSON.stringify(keys), targets: ["the", "cat"], ...extra });

describe("ghost racers", () => {
  it("knows which quick race a galley could haunt", () => {
    const g = (x) => ({ mode: "words", length: 25, list: "200", wordsDone: 25, punct: false, nums: false, sudden: false, ...x });
    expect(quickKind(g())).toBe("words");
    expect(quickKind(g({ list: "1k" }))).toBe(null);
    expect(quickKind(g({ wordsDone: 20 }))).toBe(null);
    expect(quickKind(g({ punct: true }))).toBe(null);
    expect(quickKind(g({ mode: "time", length: 30, wordsDone: 30 }))).toBe("time");
    expect(quickKind({ mode: "quote", length: 14, wordsDone: 14 })).toBe("quote");
    expect(quickKind({ mode: "quote", length: 30, wordsDone: 30 })).toBe(null);
    expect(quickKind({ mode: "survival", surv: { lives: 3, floor: 30, regen: false }, wordsDone: 40 })).toBe("survival");
    expect(quickKind({ mode: "survival", surv: { lives: 1, floor: 30 }, wordsDone: 40 })).toBe(null);
  });

  it("files a checked run in the pool, unless it's not lent or not believable", () => {
    const result = { mode: "words", length: 25, list: "200", wordsDone: 25, keys, targets: Array(30).fill("the"), secs: 20 };
    const e = poolEntry({ uid: "ana", result, name: "Ana", wpm: 70.04, acc: 97.66, now: 5 });
    expect(e.mode).toBe("words");
    expect(e.doc).toMatchObject({ uid: "ana", name: "Ana", wpm: 70, acc: 97.7, words: 25, at: 5 });
    expect(e.doc.targets).toHaveLength(26);
    expect(typeof e.doc.keys).toBe("string");
    expect(poolEntry({ uid: "ana", result: { ...result, lend: false }, wpm: 70, acc: 97, now: 5 })).toBe(null);
    expect(poolEntry({ uid: "ana", result, wpm: 400, acc: 97, now: 5 })).toBe(null);
  });

  it("picks the closest in speed, one each, never you", () => {
    const pool = [
      { uid: "me", wpm: 60 }, { uid: "a", wpm: 58 }, { uid: "a", wpm: 61 }, { uid: "b", wpm: 120 }, { uid: "c", wpm: 45 }, { uid: "d", wpm: 70 }
    ].map((g) => ({ ...run(), ...g, name: g.uid }));
    expect(pickGhosts(pool, { me: "me", wpm: 60 }).map((g) => g.name)).toEqual(["d", "a", "c"]);
  });

  it("makes up the numbers with house ghosts around your pace", () => {
    const h = houseGhosts("words", 50, 3, mulberry32(1));
    expect(h.map((g) => g.wpm)).toEqual([43, 50, 57]);
    expect(h.every((g) => g.pace && g.words === null)).toBe(true);
    expect(houseGhosts("survival", 50, 1)[0].words).toBe(64);
    const r = raceGhosts({ pool: [{ ...run(), uid: "b" }], mode: "words", me: "me", wpm: 60, rand: mulberry32(2) });
    expect(Object.keys(r)).toEqual(["g0", "g1", "g2"]);
    expect(r.g0.keys).toBeTruthy();
    expect(r.g1.pace).toBe(true);
  });

  it("races a replayed run to the end of a longer text at its own pace", () => {
    const g = run(), t = ghostTrack(g);
    expect(t.carry).toBe(true);
    expect(ghostRun(g, t, 300, { mode: "words", total: 20 })).toMatchObject({ c: 4, done: false });
    const end = ghostRun(g, t, 5000, { mode: "words", total: 20 });
    expect(end.done).toBe(true);
    expect(end.secs).toBeCloseTo(20 / (7 / 600) / 1000, 1);
    expect(end.score).toBeCloseTo(60 * 0.98 ** 2, 1);
  });

  it("runs a house ghost at its pace, and a survival one out where it falls", () => {
    const pace = { name: "The night editor", wpm: 60, acc: 97, pace: true, words: null };
    expect(ghostRun(pace, ghostTrack(pace), 10000, { mode: "time", limitMs: 30000 })).toMatchObject({ c: 50, done: false });
    expect(ghostRun(pace, ghostTrack(pace), 30000, { mode: "time", limitMs: 30000 }).done).toBe(true);
    const surv = { ...pace, words: 10 }, st = ghostTrack(surv);
    expect(ghostRun(surv, st, 1000, { mode: "survival" })).toMatchObject({ done: false, l: 1 });
    expect(ghostRun(surv, st, 60000, { mode: "survival" })).toMatchObject({ done: true, w: 10, l: 0 });
  });

  it("puts ghosts in the standings, and settles them once you're done", () => {
    const room = {
      state: "race", round: 1, startAt: 0, settings: QUICK.words, host: "me",
      players: { me: { name: "Me", online: true, joined: 1 } }, entrants: { me: true },
      runs: { 1: { me: { c: 150, w: 25, wpm: 50, acc: 100, done: true, secs: 30, score: 50 } } },
      ghosts: { g0: { name: "The night editor", wpm: 60, acc: 97, pace: true, words: null } }
    };
    const tracks = new Map();
    const typing = { ...room, runs: { 1: { me: { c: 40, w: 7, wpm: 50, acc: 100, done: false } } } };
    const early = withGhosts(typing, 5000, tracks, { mode: "words", total: 150 });
    expect(roundOver(early, 5000)).toBe(false);
    expect(early.runs[1].g0.done).toBe(false);
    expect(standings(early, 1, "me").map((r) => r.name)).toEqual(["Me", "The night editor · ghost"]); // further along
    // once you're done, the ghosts are shown as they end: no waiting for them
    const late = withGhosts(room, 5000, tracks, { mode: "words", total: 150 });
    expect(roundOver(late, 5000)).toBe(true);
    expect(late.runs[1].g0).toMatchObject({ done: true, c: 150 });
    expect(standings(late, 1, "me")[0].name).toBe("The night editor · ghost"); // 56.5 beats 50
    expect(withGhosts({ ...room, ghosts: null }, 1, tracks, {})).toEqual({ ...room, ghosts: null });
    expect(GHOSTS.perRace).toBe(3);
  });
});
