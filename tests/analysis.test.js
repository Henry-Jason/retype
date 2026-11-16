import { describe as group, it, expect } from "vitest";
import { analyse, describe, median } from "../src/core/analysis.js";
import { chartData } from "../src/core/chart-data.js";

// Build a session the way the typing engine does: one entry per key, with timings.
function session(targets, script) {
  const keys = [], typed = targets.map(() => "");
  let w = 0, total = 0, okKeys = 0, last = null;
  for (const [ch, at] of script) {
    const dt = last == null ? null : Math.round((at - last) * 1000);
    last = at;
    if (ch === "⌫") { typed[w] = typed[w].slice(0, -1); keys.push({ bs: true, at }); continue; }
    if (ch === " ") {
      const missed = Math.max(0, targets[w].length - typed[w].length), ok = missed === 0;
      keys.push({ w, pos: typed[w].length, exp: " ", ch, ok, dt, at, space: true, missed });
      total++; if (ok) okKeys++; w++; continue;
    }
    const pos = typed[w].length, exp = pos < targets[w].length ? targets[w][pos] : null, ok = ch === exp;
    keys.push({ w, pos, exp, ch, ok, dt, at });
    typed[w] += ch; total++; if (ok) okKeys++;
  }
  return { keys, targets, typed, cur: w, total, okKeys, best: 0, infinite: false };
}
const steady = (text, gap = 0.1) => [...text].map((ch, i) => [ch, i * gap]);

group("analyse", () => {
  it("scores a clean run", () => {
    const s = session(["the", "cat"], steady("the cat"));
    const r = analyse(s, 0.6);
    expect(r.acc).toBe(100);
    expect(r.errors).toBe(0);
    // 7 correct characters ("the " + "cat") in 0.6 s = 7/5 words per 0.01 min = 140 wpm
    expect(r.wpm).toBeCloseTo(140, 5);
    expect(r.weak).toEqual([]);
  });

  it("counts a fixed mistake against accuracy but not wpm", () => {
    const s = session(["the", "cat"], steady("thx⌫e cat"));
    const r = analyse(s, 0.8);
    expect(r.errors).toBe(1);
    expect(r.corrections).toBe(1);
    expect(r.acc).toBeCloseTo((7 / 8) * 100, 5);
    expect(r.wpm).toBeCloseTo(7 / 5 / (0.8 / 60), 5);
    expect(r.weak.map((w) => w.word)).toContain("the");
  });

  it("counts one wrong letter as one mistake, not two", () => {
    const r = analyse(session(["the", "cat"], steady("thx cat")), 0.6);
    expect(r.errors).toBe(1);
    expect(r.acc).toBeCloseTo((6 / 7) * 100, 5);
  });

  it("counts skipping letters with space as a mistake", () => {
    const r = analyse(session(["house", "cat"], steady("ho cat")), 0.6);
    expect(r.errors).toBe(1);
  });

  it("does not count a wrong word towards wpm", () => {
    const s = session(["the", "cat"], steady("teh cat"));
    const r = analyse(s, 0.6);
    expect(r.wpm).toBeCloseTo(3 / 5 / (0.6 / 60), 5); // only "cat" counts, and it's the last word (no space)
  });

  it("charges skipped letters to the word", () => {
    const s = session(["house", "cat"], steady("ho cat"));
    const r = analyse(s, 0.6);
    const house = r.words.find((w) => w.word === "house");
    expect(house.errs).toBe(3);
  });

  it("finds slow letter pairs from consecutive correct keys", () => {
    // every pair 100 ms apart except h→e, which takes 400 ms
    const s = session(["the", "the", "the"], [["t", 0], ["h", 0.1], ["e", 0.5], [" ", 0.6], ["t", 0.7], ["h", 0.8], ["e", 1.2], [" ", 1.3], ["t", 1.4], ["h", 1.5], ["e", 1.9]]);
    const r = analyse(s, 1.9);
    expect(r.pairs[0].bg).toBe("he");
    expect(r.pairs[0].med).toBe(400);
  });

  it("groups the same word regardless of capitals and punctuation", () => {
    const s = session(["The", "the."], steady("The the."));
    const r = analyse(s, 1);
    expect(r.words).toHaveLength(1);
    expect(r.words[0].occ).toBe(2);
  });
});

group("describe", () => {
  it("names the first slip", () => {
    expect(describe("increase", "inceease")).toBe("r, not e");
    expect(describe("should", "shou")).toBe("dropped ld");
    expect(describe("cat", "cats")).toBe("extra s");
    expect(describe("a b", "a_b")).toBe("space, not _");
  });
});

group("median", () => {
  it("handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

group("chartData", () => {
  it("has a point per key and a burst per correct word", () => {
    const s = session(["the", "cat"], steady("the cat", 0.2));
    const d = chartData(s, 1.2);
    expect(d.pts).toHaveLength(7);
    const bursts = d.pts.filter((p) => p.burst != null);
    expect(bursts).toHaveLength(2);
    // "the": first key at 0, space at 0.6 s → 3 characters in 0.6 s = 60 wpm
    expect(bursts[0].burst).toBeCloseTo(60, 5);
  });
  it("holds back actual speed for the first second", () => {
    const s = session(["the", "cat"], steady("the cat", 0.2));
    const d = chartData(s, 1.2);
    expect(d.pts.filter((p) => p.s < 1).every((p) => p.act == null)).toBe(true);
    expect(d.pts[d.pts.length - 1].act).not.toBeNull();
  });
  it("gives no burst to a word left wrong", () => {
    const s = session(["the", "cat"], steady("teh cat", 0.2));
    expect(chartData(s, 1.2).pts.filter((p) => p.burst != null)).toHaveLength(1);
  });
});
