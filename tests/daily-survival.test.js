import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { verifyDailySurvival } from "../src/core/verify.js";
import { survivalSeq, nextBatch, replayLives, dailySurvSeed, DAILY_SURV, FIRST_BATCH, NEXT_BATCH } from "../src/core/survival.js";
import { mulberry32 } from "../src/core/rng.js";

// A real run, typed in the app in a browser and saved: words, a wrong key, a stall that cost a
// life to the 30 wpm floor, and a space that skipped letters to end it.
const run = JSON.parse(readFileSync(new URL("./fixtures/daily-survival-run.json", import.meta.url)));
const keys = (r) => (typeof r.keys === "string" ? JSON.parse(r.keys) : r.keys);

let survivalEntry;
beforeAll(async () => { ({ survivalEntry } = await import("../functions/board.js")); });

describe("dealing a run", () => {
  it("is the same in batches as all at once, so the server can rebuild it", () => {
    const seed = 1234, rand = mulberry32(seed), words = [];
    while (words.length < 400) words.push(...nextBatch(words, { rand }));
    expect(words.slice(0, 400)).toEqual(survivalSeq(seed, 400));
    expect(nextBatch([], { rand: mulberry32(1) })).toHaveLength(FIRST_BATCH);
    expect(nextBatch(words, { rand })).toHaveLength(NEXT_BATCH);
  });
  it("gives each day its own run, different from the daily galley's seed", () => {
    expect(dailySurvSeed("2026-11-21")).not.toBe(dailySurvSeed("2026-11-22"));
  });
});

describe("checking a daily survival run", () => {
  it("accepts the real run", () => {
    const v = verifyDailySurvival(run);
    expect(v.ok).toBe(true);
    expect(v.words).toBe(run.wordsDone);
  });
  it("counts lives from the keys the way the desk does", () => {
    const r = replayLives(keys(run), survivalSeq(run.seed, 200), DAILY_SURV, run.secs);
    expect(r).toMatchObject({ ok: true, lives: 0, words: run.wordsDone });
  });
  it("turns away claimed extra words, missing slow lives, invented ones and keys after the end", () => {
    expect(verifyDailySurvival({ ...run, wordsDone: run.wordsDone + 1 }).ok).toBe(false);
    expect(verifyDailySurvival({ ...run, keys: keys(run).filter((k) => k[5] !== 4), surv: { ...run.surv, left: 1 } }).reason).toBe("too slow without losing a life");
    const k = keys(run), early = k.findIndex((x) => x[5] === 1) + 1;
    const fake = [...k.slice(0, early), [-1, -1, "", 0, k[early - 1][4], 4], ...k.slice(early)];
    expect(verifyDailySurvival({ ...run, keys: fake }).reason).toBe("a life lost to speed that wasn't slow");
    expect(verifyDailySurvival({ ...run, keys: [...k, [0, 0, "x", 0, k[k.length - 1][4] + 500, 0]] }).ok).toBe(false);
  });
  it("needs the fixed rules and that day's words", () => {
    expect(verifyDailySurvival({ ...run, surv: { ...run.surv, lives: 10 } }).ok).toBe(false);
    expect(verifyDailySurvival({ ...run, day: "2026-11-22" }).ok).toBe(false);
    expect(verifyDailySurvival({ ...run, targets: ["the", ...run.targets.slice(1)] }).ok).toBe(false);
  });
  it("posts it to the board, ranked by words then score", () => {
    const out = survivalEntry({ uid: run.userId, rid: run.id, result: run, name: "Henry", now: run.at + 1000 });
    expect(out.ok).toBe(true);
    expect(out.entry).toMatchObject({ name: "Henry", words: run.wordsDone });
    expect(Math.floor(out.entry.rank / 1000)).toBe(run.wordsDone);
    expect(survivalEntry({ uid: "someone-else", rid: run.id, result: run, now: run.at }).ok).toBe(false);
  });
});
