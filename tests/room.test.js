import { describe, it, expect } from "vitest";
import { mulberry32 } from "../src/core/rng.js";
import { ROOM, newCode, readCode, CODE_RE, roomSettings, settingsLabel, playerList, nextHost, runReport, roundOver, standings, ordinal } from "../src/core/room.js";

const room = (over = {}) => ({
  host: "a", state: "race", round: 1, startAt: 1000, settings: { mode: "words", length: 25, list: "200" },
  players: { a: { name: "Ana", joined: 1, online: true }, b: { name: "Ben", joined: 2, online: true }, c: { name: "Cat", joined: 3, online: true } },
  entrants: { a: true, b: true },
  runs: {}, ...over
});

describe("friend rooms", () => {
  it("makes codes that can be read out loud", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const c = newCode(rand);
      expect(c).toMatch(CODE_RE);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });

  it("reads a code from what people paste", () => {
    expect(readCode("abc23")).toBe("ABC23");
    expect(readCode(" KXQ7P ")).toBe("KXQ7P");
    expect(readCode("https://retype.web.app/#room=KXQ7P")).toBe("KXQ7P");
    expect(readCode("ABC1O")).toBe(null);
    expect(readCode("ABCD")).toBe(null);
    expect(readCode("")).toBe(null);
  });

  it("only allows settings a room can race", () => {
    expect(roomSettings({ mode: "time", length: 60, list: "5k", punct: 1 })).toEqual({ mode: "time", length: 60, list: "5k", punct: true, nums: false });
    expect(roomSettings({ mode: "time", length: 37 })).toEqual({ mode: "time", length: 30, list: "200", punct: false, nums: false });
    expect(roomSettings({ mode: "survival", length: 50, list: "450k" })).toEqual({ mode: "words", length: 50, list: "200", punct: false, nums: false });
    expect(settingsLabel(roomSettings({ mode: "words", length: 50, list: "1k", nums: true }))).toBe("50 words · top 1,000 · numbers");
  });

  it("lists players in joining order and hands the room on when the host goes", () => {
    const r = room();
    expect(playerList(r).map((p) => p.uid)).toEqual(["a", "b", "c"]);
    expect(nextHost(r)).toBe("a");
    r.players.a.online = false;
    expect(nextHost(r)).toBe("b");
    r.players.b.online = false; r.players.c.online = false;
    expect(nextHost(r)).toBe(null);
  });

  it("rounds what players send and scores a finish", () => {
    expect(runReport({ chars: 41.6, words: 8, wpm: 71.234, acc: 97.66, at: 5 })).toEqual({ c: 42, w: 8, wpm: 71.2, acc: 97.7, done: false, at: 5 });
    const done = runReport({ chars: 140, words: 25, wpm: 80, acc: 100, done: true, secs: 18.756, at: 9 });
    expect(done.secs).toBe(18.76);
    expect(done.score).toBe(80);
  });

  it("calls a round when everyone who started is done or gone", () => {
    const r = room();
    expect(roundOver(r, 2000)).toBe(false);
    r.runs = { 1: { a: { done: true } } };
    expect(roundOver(r, 2000)).toBe(false);
    r.players.b.online = false;
    expect(roundOver(r, 2000)).toBe(true); // Cat joined late and isn't racing
    expect(roundOver({ ...room(), state: "done" }, 0)).toBe(true);
    expect(roundOver({ ...room(), state: "lobby" }, 0)).toBe(false);
  });

  it("calls a round on the clock", () => {
    const timed = room({ settings: { mode: "time", length: 30 } });
    expect(roundOver(timed, 1000 + 30000 + ROOM.graceMs)).toBe(false);
    expect(roundOver(timed, 1000 + 30000 + ROOM.graceMs + 1)).toBe(true);
    expect(roundOver(room(), 1000 + ROOM.wordsCapMs + 1)).toBe(true);
  });

  it("places finishers by score, then the rest by how far they got", () => {
    const r = room({ entrants: { a: true, b: true, c: true } });
    r.runs = { 1: {
      a: { c: 140, w: 25, wpm: 90, acc: 90, done: true, secs: 15, score: 72.9 },
      b: { c: 140, w: 25, wpm: 75, acc: 100, done: true, secs: 18, score: 75 },
      c: { c: 60, w: 11, wpm: 60, acc: 99, done: false }
    } };
    const s = standings(r, 1, "b");
    expect(s.map((x) => [x.name, x.place])).toEqual([["Ben", 1], ["Ana", 2], ["Cat", 3]]);
    expect(s[0].me).toBe(true);
    // nobody has sent anything yet: everyone's still listed, at the start
    expect(standings(room(), 1).map((x) => x.c)).toEqual([0, 0]);
  });

  it("writes places", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
  });
});
