import { describe, it, expect } from "vitest";
import { wordStarts, textLength, ghostTimeline, charsAt, timeAt, place, leadSecs, fmtLead } from "../src/core/ghost.js";

// packed keys: [word, pos, char, ok, ms, flags]
const key = (w, pos, ch, ms, ok = 1) => [w, pos, ch, ok, ms, 0];
const spc = (w, pos, ms) => [w, pos, " ", 1, ms, 1];
const bs = (ms) => [-1, -1, "", 0, ms, 2];

describe("ghost races", () => {
  const targets = ["the", "cat"];
  // "the cat", one key every 100ms
  const clean = [key(0, 0, "t", 0), key(0, 1, "h", 100), key(0, 2, "e", 200), spc(0, 3, 300), key(1, 0, "c", 400), key(1, 1, "a", 500), key(1, 2, "t", 600)];

  it("measures text with the spaces between words", () => {
    expect(wordStarts(targets)).toEqual([0, 4, 8]);
    expect(textLength(targets)).toBe(7);
  });

  it("replays a clean run to the end of the text", () => {
    const tl = ghostTimeline(clean, targets);
    expect(tl.end).toBe(600);
    expect(tl.reach).toBe(7);
    expect(charsAt(tl, 0)).toBe(0);
    expect(charsAt(tl, 300)).toBe(4);   // after the space: start of "cat"
    expect(charsAt(tl, 350)).toBe(4.5); // gliding between keys
    expect(charsAt(tl, 9999)).toBe(7);
  });

  it("steps back on backspace, including into the previous word", () => {
    const keys = [key(0, 0, "t", 0), key(0, 1, "x", 100, 0), bs(200), key(0, 1, "h", 300), key(0, 2, "e", 400), spc(0, 3, 500), bs(600)];
    const tl = ghostTimeline(keys, targets);
    expect(charsAt(tl, 100)).toBe(2);
    expect(charsAt(tl, 200)).toBe(1);
    expect(charsAt(tl, 150)).toBe(2); // no gliding backwards
    expect(charsAt(tl, 500)).toBe(4);
    expect(charsAt(tl, 600)).toBe(3); // back at the end of "the"
  });

  it("ignores survival lives lost to the speed floor", () => {
    const tl = ghostTimeline([key(0, 0, "t", 0), [-1, -1, "", 0, 50, 4], key(0, 1, "h", 100)], targets);
    expect(tl.pts.map((p) => p[1])).toEqual([0, 1, 2]);
  });

  it("knows when it got somewhere, and carries on at its pace past the end", () => {
    const tl = ghostTimeline(clean, targets);
    expect(timeAt(tl, 4)).toBe(300);
    expect(timeAt(tl, 7)).toBe(600);
    expect(timeAt(tl, 14)).toBeCloseTo(1200); // 7 chars per 600ms
  });

  it("lays a distance onto a different text", () => {
    const other = ["a", "longer", "line"], starts = wordStarts(other);
    expect(place(0, starts, other)).toEqual({ w: 0, p: 0 });
    expect(place(1, starts, other)).toEqual({ w: 0, p: 1 }); // on the space after "a"
    expect(place(2, starts, other)).toEqual({ w: 1, p: 0 });
    expect(place(5.6, starts, other)).toEqual({ w: 1, p: 3 });
    expect(place(99, starts, other)).toEqual({ w: 2, p: 4 });
  });

  it("works out your lead in seconds", () => {
    const tl = ghostTimeline(clean, targets);
    expect(leadSecs(tl, 4, 200)).toBeCloseTo(0.1);   // you got there 100ms sooner
    expect(leadSecs(tl, 4, 450)).toBeCloseTo(-0.15);
    expect(leadSecs(tl, 0, 450)).toBe(0);
    expect(fmtLead(1.234)).toBe("+1.2s");
    expect(fmtLead(-0.4)).toBe("−0.4s");
    expect(fmtLead(0.01)).toBe("level");
  });
});
