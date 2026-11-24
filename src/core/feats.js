// Achievements, reported as headlines. Each is earned once and kept (with when, and sometimes a
// detail such as the word you finally stopped fumbling), in the scrapbook on the Stats page.
// Pure: checkFeats looks at one finished galley and the progress state after it.
import { SURVIVAL } from "./survival.js";

const SURV = (r) => r.mode === "survival";
const big = (r, n) => (r.wordsDone || 0) >= n;
const fast = (wpm) => (r) => (r.kind === "normal" || r.kind === "mix" || r.kind === "daily" || r.kind === "challenge" || r.kind === "room") && (r.mode === "words" || r.mode === "time") && big(r, 25) && r.acc >= 95 && r.wpm >= wpm;
const survived = (n) => (r) => SURV(r) && big(r, n);

/**
 * head: the headline (may use {d} for the detail); dek: the line under it; hint: how to earn it,
 * shown on the scrapbook before it's earned. check(result, ctx) returns true, or a detail string.
 * ctx: { totals, bestStreak, streak (days), level, rankIndex, prevWeak, weak, hour }
 */
export const FEATS = [
  { id: "first", head: "Local typist files first galley", dek: "A career in print begins quietly.", hint: "Finish a galley.", check: () => true },
  { id: "perfect10", head: "Not a mark on it", dek: "Proofreaders report nothing to report.", hint: "A galley of 10+ words with no mistakes and no corrections.", check: (r) => r.clean && big(r, 10) },
  { id: "perfect50", head: "Fifty words, not one correction", dek: "Red pencil left untouched in its pot.", hint: "A clean galley of 50+ words.", check: (r) => r.clean && big(r, 50) },
  { id: "perfect100", head: "Century without a correction; proofreaders furloughed", dek: "A hundred words, a hundred right.", hint: "A clean galley of 100+ words.", check: (r) => r.clean && big(r, 100) },
  { id: "streak50", head: "Fifty clean words in a row, sources confirm", dek: "Witnesses describe the run as 'unremarkable, in the best way'.", hint: "A clean streak of 50 words.", check: (r) => (r.bestStreak || 0) >= 50 },
  { id: "streak100", head: "Hundred-word clean streak stuns desk", dek: "Not a single word struck through.", hint: "A clean streak of 100 words.", check: (r) => (r.bestStreak || 0) >= 100 },
  { id: "wpm60", head: "Typist clocks 60 wpm without cutting corners", dek: "At 95% or better, which is the part that counts.", hint: "60 wpm at 95%+ over 25+ words.", check: fast(60) },
  { id: "wpm80", head: "80 wpm at 95%: desk lamp flickers", dek: "Neighbours report a sound 'like light rain'.", hint: "80 wpm at 95%+ over 25+ words.", check: fast(80) },
  { id: "wpm100", head: "Keyboard seeks counselling after 100 wpm galley", dek: "And still 95% accurate.", hint: "100 wpm at 95%+ over 25+ words.", check: fast(100) },
  { id: "wpm120", head: "120 wpm: experts demand a recount", dek: "The recount confirms it.", hint: "120 wpm at 95%+ over 25+ words.", check: fast(120) },
  { id: "tenk", head: "Typist tames the 10,000", dek: "Rare words, typed well.", hint: "A 25+ word galley from the top 10,000 at 95%+.", check: (r) => r.list === "10k" && (r.mode === "words" || r.mode === "time") && big(r, 25) && r.acc >= 95 },
  { id: "surv1k", head: "Survivor leaves the shallow end", dek: "Through the top 200 and into the thousand.", hint: "Survive 50 words.", check: survived(50) },
  { id: "surv5k", head: "Typist reaches 5K region, lives to tell tale", dek: "The words got longer. The typist didn't flinch.", hint: "Survive 150 words.", check: survived(150) },
  { id: "surv10k", head: "Expedition reaches the 10K region", dek: "Few have typed this far from home.", hint: "Survive 350 words.", check: survived(350) },
  { id: "surv500", head: "500 words survived; experts baffled", dek: "'We assumed someone would make a mistake eventually.'", hint: "Survive 500 words.", check: survived(500) },
  { id: "surv1000", head: "Thousand-word survivor refuses to stop", dek: "Officials considering a longer roll.", hint: "Survive 1,000 words.", check: survived(1000) },
  { id: "survroll", head: "Roll runs out before typist does", dek: "The till has been sent for repairs.", hint: "Reach the end of a survival roll.", check: survived(SURVIVAL.maxWords) },
  { id: "sudden100", head: "Sudden death? Not today", dek: "A hundred words on a single life.", hint: "Survive 100 words with 1 life.", check: (r) => SURV(r) && r.surv?.lives === 1 && big(r, 100) },
  { id: "dsurv", head: "Early edition: first daily survival filed", dek: "Today's run, on the record.", hint: "Play a daily survival run.", check: (r) => r.kind === "dsurv" },
  { id: "room", head: "Local typists meet in friendly race", dek: "Same words, same start, no excuses.", hint: "Finish a race in a friend room.", check: (r) => r.kind === "room" && big(r, 10) },
  { id: "daily", head: "Daily galley filed before deadline", dek: "The same 40 words as everyone else, done.", hint: "Finish a daily galley.", check: (r) => r.kind === "daily" && big(r, 40) },
  { id: "python", head: "Typist found to be fluent in Python", dek: "Indentation: impeccable.", hint: "Finish a Python script at 95%+.", check: (r) => r.kind === "code" && r.acc >= 95 },
  { id: "quote", head: "Quote, unquote", dek: "Somebody else's words, typed as your own.", hint: "Finish a quote.", check: (r) => r.kind === "quote" && r.wordsDone >= r.length },
  { id: "night", head: "Late edition: typist still at desk after midnight", dek: "Editors advise sleep. Typist advises one more galley.", hint: "Finish a galley between midnight and 4am.", check: (r, c) => c.hour >= 0 && c.hour < 4 },
  { id: "feud", head: "Long-running feud with '{d}' ends", dek: "Once a regular in your weak words, now typed cleanly and on time.", hint: "Get a word off your weak list for good.",
    check: (r, c) => Object.keys(c.prevWeak || {}).find((w) => c.prevWeak[w].trouble >= 1 && c.weak?.[w] && c.weak[w].trouble < 0.25) || false },
  { id: "days7", head: "Seven-day streak; neighbours concerned", dek: "A galley every day for a week.", hint: "A 7-day streak.", check: (r, c) => c.streak >= 7 },
  { id: "days30", head: "Thirty days straight at the desk", dek: "A month without missing an edition.", hint: "A 30-day streak.", check: (r, c) => c.streak >= 30 },
  { id: "galleys100", head: "Hundredth galley goes to press", dek: "The presses are warm now.", hint: "Finish 100 galleys.", check: (r, c) => c.totals.galleys >= 100 },
  { id: "galleys1000", head: "Thousandth galley: building names a wing after typist", dek: "It's a small wing.", hint: "Finish 1,000 galleys.", check: (r, c) => c.totals.galleys >= 1000 },
  { id: "level10", head: "Typist reaches level 10", dek: "Double figures.", hint: "Reach level 10.", check: (r, c) => c.level >= 10 },
  { id: "level25", head: "Level 25: typist given a key to the building", dek: "And a desk by the window.", hint: "Reach level 25.", check: (r, c) => c.level >= 25 },
  { id: "proofreader", head: "New proofreader appointed", dek: "Earned the hard way: one PP at a time.", hint: "Reach the rank of Proofreader.", check: (r, c) => c.rankIndex >= 4 },
  { id: "editor", head: "Editor's chair claimed", dek: "The corner office awaits.", hint: "Reach the rank of Editor.", check: (r, c) => c.rankIndex >= 8 }
];
const BY_ID = new Map(FEATS.map((f) => [f.id, f]));

/** Feats this galley earns that aren't already held. Returns [{ id, d? }]. */
export function checkFeats(have = {}, result, ctx) {
  const out = [];
  for (const f of FEATS) {
    if (have[f.id]) continue;
    let v = false;
    try { v = f.check(result, ctx); } catch { v = false; }
    if (v) out.push(typeof v === "string" ? { id: f.id, d: v } : { id: f.id });
  }
  return out;
}

/** Add earned feats to the held ones: { id: { at, d? } }. */
export function addFeats(have = {}, earned, at) {
  if (!earned.length) return have;
  const next = { ...have };
  for (const e of earned) next[e.id] = e.d ? { at, d: e.d } : { at };
  return next;
}

/** Two devices' feats together: each kept once, the earlier one winning. */
export function mergeFeats(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, v] of Object.entries(b || {})) if (!out[id] || (v?.at ?? Infinity) < (out[id]?.at ?? Infinity)) out[id] = v;
  return out;
}

/** The headline for a held feat, detail filled in. */
export function headline(id, held) {
  const f = BY_ID.get(id);
  if (!f) return "";
  return f.head.replace("{d}", held?.d || "a word");
}
export const featById = (id) => BY_ID.get(id);
