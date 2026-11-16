import { describe, it, expect } from "vitest";
import { score, rankFrom, RANKS, isRanked, modeKey, updateBests, streak, dayKey, updateWeak, topWeak } from "../src/core/progress.js";

const ranked = (sc, extra = {}) => ({ kind: "normal", mode: "words", length: 25, list: "200", wordsDone: 25, score: sc, wpm: sc, acc: 100, ...extra });

describe("score", () => {
  it("weighs accuracy heavily", () => {
    expect(score(80, 100)).toBe(80);
    expect(score(100, 90)).toBeCloseTo(81, 5);
    expect(score(120, 80)).toBeCloseTo(76.8, 5);
  });
});

describe("rank", () => {
  it("needs three ranked galleys first", () => {
    expect(rankFrom([ranked(50), ranked(50)])).toMatchObject({ rank: null, needed: 1 });
  });
  it("averages the last ten ranked galleys", () => {
    const r = rankFrom([ranked(60), ranked(50), ranked(40)]);
    expect(r.rank.name).toBe("Proofreader");
    expect(r.score).toBe(50);
    expect(r.next.name).toBe("Sub-editor");
    expect(r.progress).toBe(0);
    const old = Array(20).fill(ranked(10));
    expect(rankFrom([...Array(10).fill(ranked(90)), ...old]).rank.name).toBe("Editor");
  });
  it("ignores practice, code, flow, sudden death and short galleys", () => {
    expect(isRanked(ranked(50, { kind: "practice" }))).toBe(false);
    expect(isRanked(ranked(50, { kind: "code", mode: "code" }))).toBe(false);
    expect(isRanked(ranked(50, { mode: "flow" }))).toBe(false);
    expect(isRanked(ranked(50, { sudden: true }))).toBe(false);
    expect(isRanked(ranked(50, { wordsDone: 10 }))).toBe(false);
  });
  it("tops out at the last rank", () => {
    const r = rankFrom(Array(5).fill(ranked(150)));
    expect(r.rank).toBe(RANKS[RANKS.length - 1]);
    expect(r.next).toBeNull();
    expect(r.progress).toBe(1);
  });
});

describe("personal bests", () => {
  it("keys galleys by everything that changes difficulty", () => {
    expect(modeKey(ranked(1))).toBe("25w 200");
    expect(modeKey(ranked(1, { mode: "time", length: 30, list: "1k", punct: true }))).toBe("30s 1k punct");
    expect(modeKey({ kind: "code", snippet: "fizzbuzz" })).toBe("code:fizzbuzz");
    expect(modeKey(ranked(1, { kind: "practice" }))).toBeNull();
  });
  it("records a better score and reports the old one", () => {
    let b = {};
    let u = updateBests(b, ranked(40, { id: "a" }));
    expect(u.isBest).toBe(true);
    u = updateBests(u.bests, ranked(35, { id: "b" }));
    expect(u.isBest).toBe(false);
    u = updateBests(u.bests, ranked(55, { id: "c" }));
    expect(u.isBest).toBe(true);
    expect(u.previous.score).toBe(40);
    expect(u.bests["25w 200"].id).toBe("c");
  });
  it("needs at least 10 words for a best", () => {
    expect(updateBests({}, ranked(99, { wordsDone: 3, sudden: true })).isBest).toBe(false);
    expect(updateBests({}, ranked(99, { wordsDone: 10 })).isBest).toBe(true);
  });
  it("doesn't record flow galleys", () => {
    expect(updateBests({}, ranked(99, { mode: "flow" })).isBest).toBe(false);
  });
});

describe("streak", () => {
  const T = "2026-11-16";
  it("counts consecutive days", () => {
    expect(streak(["2026-11-14", "2026-11-15", "2026-11-16"], T)).toMatchObject({ count: 3, alive: true, graceLeft: true });
  });
  it("doesn't break before today is over", () => {
    expect(streak(["2026-11-14", "2026-11-15"], T).count).toBe(2);
  });
  it("forgives one missed day", () => {
    const s = streak(["2026-11-12", "2026-11-13", "2026-11-15", "2026-11-16"], T);
    expect(s.count).toBe(4);
    expect(s.graceLeft).toBe(false);
  });
  it("keeps a streak alive when yesterday was missed and today isn't played yet", () => {
    expect(streak(["2026-11-13", "2026-11-14"], T).count).toBe(2);
  });
  it("doesn't forgive two misses within a week", () => {
    expect(streak(["2026-11-10", "2026-11-12", "2026-11-14", "2026-11-16"], T).count).toBe(2);
  });
  it("forgives misses a week or more apart", () => {
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-16"];
    expect(streak(days, T).count).toBe(14);
  });
  it("breaks on a two-day gap", () => {
    expect(streak(["2026-11-12", "2026-11-13", "2026-11-16"], T).count).toBe(1);
    expect(streak(["2026-11-12", "2026-11-13"], T)).toMatchObject({ count: 0, alive: false });
  });
  it("crosses month and year ends", () => {
    expect(streak(["2025-12-30", "2025-12-31", "2026-01-01"], "2026-01-01").count).toBe(3);
  });
  it("makes local day keys", () => {
    expect(dayKey(new Date(2026, 10, 16, 23, 59).getTime())).toBe("2026-11-16");
  });
});

describe("weak-word profile", () => {
  const w = (word, errs, occ = 1, slow = 0) => ({ word, errs, occ, slow });
  it("starts a word at how badly it went", () => {
    const p = updateWeak({}, [w("order", 2)], 1);
    expect(p.order.trouble).toBe(2);
    expect(topWeak(p)[0].word).toBe("order");
  });
  it("lets clean appearances wear the trouble down", () => {
    let p = updateWeak({}, [w("order", 2)], 1);
    for (let i = 0; i < 8; i++) p = updateWeak(p, [w("order", 0)], 2 + i);
    expect(p.order.trouble).toBeLessThan(0.05);
    expect(topWeak(p)).toEqual([]);
  });
  it("weighs several appearances in one galley more", () => {
    const once = updateWeak({ x: { trouble: 1, seen: 1, last: 0 } }, [w("x", 0, 1)], 1).x.trouble;
    const thrice = updateWeak({ x: { trouble: 1, seen: 1, last: 0 } }, [w("x", 0, 3)], 1).x.trouble;
    expect(thrice).toBeLessThan(once);
  });
  it("sorts the worst first and caps the list", () => {
    const p = updateWeak({}, [w("a", 1), w("b", 3), w("c", 2), w("d", 0)], 1);
    expect(topWeak(p, 2).map((x) => x.word)).toEqual(["b", "c"]);
  });
});
