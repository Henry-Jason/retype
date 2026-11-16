import { describe, it, expect } from "vitest";
import { rescore, verifyForBoard, verifyDaily, LIMITS } from "../src/core/verify.js";
import { analyse } from "../src/core/analysis.js";
import { packKeys } from "../src/core/result.js";
import { mulberry32 } from "../src/core/rng.js";
import { genWords } from "../src/core/words.js";
import { dailySeed } from "../src/core/challenge.js";
import { score } from "../src/core/progress.js";

// A typing engine with the app's rules (src/ui/app.js): letters, space, backspace (stepping
// back into a wrong previous word), ctrl+backspace, stop-on-letter. It drives a simulated
// typist so the server's recomputation can be checked against the app's own scoring.
function engine(targets, { stopLetter = false } = {}) {
  const s = { targets, typed: targets.map(() => ""), keys: [], cur: 0, total: 0, okKeys: 0, best: 0, done: false, t: 0 };
  const at = () => (s.t += 0.03 + 0.12 * ((s.keys.length * 7919) % 13) / 13);
  s.char = (ch) => {
    const w = s.cur, tgt = targets[w], pos = s.typed[w].length;
    if (pos >= tgt.length + 10) return;
    const exp = pos < tgt.length ? tgt[pos] : null, ok = ch === exp;
    if (!ok && stopLetter) { s.keys.push({ w, pos, exp, ch, ok: false, at: at() }); s.total++; return; }
    s.typed[w] += ch; s.keys.push({ w, pos, exp, ch, ok, at: at() }); s.total++; if (ok) s.okKeys++;
    if (w === targets.length - 1 && s.typed[w] === tgt) s.done = true;
  };
  s.space = () => {
    const w = s.cur, typed = s.typed[w];
    if (!typed.length) return;
    const missed = Math.max(0, targets[w].length - typed.length), ok = missed === 0;
    s.keys.push({ w, pos: typed.length, exp: " ", ch: " ", ok, space: true, missed, at: at() }); s.total++; if (ok) s.okKeys++;
    if (w === targets.length - 1) { s.done = true; return; }
    s.cur++;
  };
  s.back = (whole) => {
    const w = s.cur;
    if (!s.typed[w].length) {
      if (w > 0 && s.typed[w - 1] !== targets[w - 1]) s.cur--;
      return;
    }
    s.typed[w] = whole ? "" : s.typed[w].slice(0, -1);
    s.keys.push({ bs: true, at: at() });
  };
  return s;
}
// A typist who mostly gets it right, sometimes slips, sometimes fixes it and sometimes doesn't.
function simulate(targets, rand, opts) {
  const s = engine(targets, opts);
  let guard = 0;
  while (!s.done && guard++ < 5000) {
    const tgt = targets[s.cur], typed = s.typed[s.cur];
    const r = rand();
    if (typed === tgt) { s.space(); continue; }
    if (!tgt.startsWith(typed)) {
      if (r < 0.75) s.back(r < 0.1); else if (r < 0.85) s.space(); else s.char("x");
      continue;
    }
    if (r < 0.06) s.char("q");
    else if (r < 0.08 && typed.length) s.space();
    else s.char(tgt[typed.length]);
  }
  return s;
}
const claim = (s) => {
  const secs = s.t + 0.01, r = analyse(s, secs);
  return { keys: packKeys(s.keys), targets: s.targets, secs, wpm: r.wpm, acc: r.acc, keyCount: r.keys, score: score(r.wpm, r.acc) };
};

describe("rescoring from the keystroke log", () => {
  it("agrees with the app's own scoring across many simulated typists", () => {
    const rand = mulberry32(2026);
    for (let i = 0; i < 300; i++) {
      const targets = genWords(10 + (i % 30), { rand: mulberry32(i), list: "1k" });
      const s = simulate(targets, rand, { stopLetter: i % 5 === 0 });
      const c = claim(s), r = rescore(c);
      expect(r.ok, `run ${i}: ${r.reason}`).toBe(true);
      expect(r.acc).toBeCloseTo(c.acc, 6);
      expect(r.wpm).toBeCloseTo(c.wpm, 6);
    }
  });
  it("reads the string form the cloud stores", () => {
    const s = simulate(genWords(15, { rand: mulberry32(3), list: "1k" }), mulberry32(1)), c = claim(s);
    expect(rescore({ ...c, keys: JSON.stringify(c.keys) }).wpm).toBeCloseTo(c.wpm, 6);
  });
});

describe("catching tampering", () => {
  const honest = () => claim(simulate(genWords(25, { rand: mulberry32(5), list: "1k" }), mulberry32(6)));
  it("passes an honest galley", () => {
    expect(verifyForBoard(honest()).ok).toBe(true);
  });
  it("catches an inflated speed or accuracy", () => {
    const c = honest();
    expect(verifyForBoard({ ...c, wpm: c.wpm * 1.5 }).reason).toMatch(/speed/);
    expect(verifyForBoard({ ...c, acc: Math.min(100, c.acc + 3) }).reason).toMatch(/accuracy/);
  });
  it("catches a mistake relabelled as correct", () => {
    const c = honest(), keys = c.keys.map((k) => k.slice());
    const i = keys.findIndex((k) => k[3] === 0 && k[5] === 0);
    keys[i][3] = 1;
    expect(rescore({ ...c, keys }).reason).toMatch(/doesn't match/);
  });
  it("catches a shortened clock", () => {
    const c = honest();
    expect(verifyForBoard({ ...c, secs: c.secs / 2, wpm: c.wpm * 2 }).ok).toBe(false);
  });
  it("catches scripted typing", () => {
    const targets = genWords(25, { rand: mulberry32(9), list: "1k" });
    const s = engine(targets);
    for (const [i, w] of targets.entries()) { for (const ch of w) s.char(ch); if (i < targets.length - 1) s.space(); }
    s.keys.forEach((k, i) => { k.at = 1 + i * 0.005; });
    const r = analyse(s, s.keys[s.keys.length - 1].at);
    const c = { keys: packKeys(s.keys), targets, secs: s.keys[s.keys.length - 1].at, wpm: r.wpm, acc: r.acc, keyCount: r.keys };
    expect(verifyForBoard(c).ok).toBe(false);
  });
  it("rejects nonsense", () => {
    expect(rescore({ keys: "not json", targets: ["a"] }).ok).toBe(false);
    expect(rescore({ keys: [[9, 0, "a", 1, 0, 0]], targets: ["a"] }).ok).toBe(false);
    expect(rescore({ keys: [], targets: ["a"] }).ok).toBe(false);
  });
  it("has sane limits", () => {
    expect(LIMITS.maxWpm).toBeGreaterThan(200);
  });
});

describe("the daily galley", () => {
  const day = "2026-11-16";
  const daily = () => {
    const targets = genWords(40, { rand: mulberry32(dailySeed(day)), list: "1k" });
    const s = simulate(targets, mulberry32(77));
    return { ...claim(s), kind: "daily", mode: "words", list: "1k", day, seed: dailySeed(day), wordsDone: 40, punct: false, nums: false, sudden: false };
  };
  it("passes that day's words", () => {
    expect(verifyDaily(daily()).ok).toBe(true);
  });
  it("refuses another day's words, other settings or an unfinished galley", () => {
    expect(verifyDaily({ ...daily(), day: "2026-11-17" }).ok).toBe(false);
    expect(verifyDaily({ ...daily(), list: "200" }).ok).toBe(false);
    expect(verifyDaily({ ...daily(), punct: true }).ok).toBe(false);
    expect(verifyDaily({ ...daily(), wordsDone: 39 }).ok).toBe(false);
    const d = daily();
    expect(verifyDaily({ ...d, targets: ["easy", ...d.targets.slice(1)] }).ok).toBe(false);
    expect(verifyDaily({ ...d, kind: "normal" }).ok).toBe(false);
  });
});
