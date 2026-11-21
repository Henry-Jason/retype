// Survival: type until you run out of lives. A word costs a life the moment it gets its first
// wrong key (more mistakes in the same word are free, and fixing it doesn't give it back), the words get harder the further you go, and an optional speed floor
// stops a run from being won by typing slowly. Pure functions only; the desk (ui/app.js) keeps
// the running state.
import { genWords, decorate } from "./words.js";

export const SURVIVAL = {
  lives: [1, 3, 5, 10],      // presets; 1 is sudden death
  floors: [0, 20, 30, 40, 60], // wpm; 0 is off
  window: 10,                // the speed floor looks at your last this-many words
  regenEvery: 50,            // with regen on: a life back after this many clean words in a row
  maxWords: 1990             // the roll runs out here (a stored galley holds up to 2,000 words)
};

// Where each word list takes over. The marker above the first word of each region says so.
export const REGIONS = [
  { at: 0, list: "200", label: "200 region" },
  { at: 50, list: "1k", label: "1K region" },
  { at: 150, list: "5k", label: "5K region" },
  { at: 350, list: "10k", label: "10K region" }
];

/** The region word i (0-based) belongs to. */
export const regionAt = (i) => {
  let r = REGIONS[0];
  for (const x of REGIONS) if (i >= x.at) r = x;
  return r;
};
/** The label to show above word i, if it's the first word of a region. */
export const regionStart = (i) => REGIONS.find((x) => x.at === i)?.label ?? null;

/**
 * Words start .. start+n-1 of a survival run, each drawn from its own region's list.
 * Punctuation and numbers only when asked for. Never the same word twice in a row,
 * across a region boundary included.
 */
export function survivalWords(start, n, { rand, punct = false, nums = false, prev = null } = {}) {
  const out = [];
  let i = start;
  while (out.length < n) {
    const r = regionAt(i), next = REGIONS.find((x) => x.at > i);
    const take = Math.min(n - out.length, next ? next.at - i : Infinity);
    let chunk = genWords(take, { rand, list: r.list });
    const last = out.length ? out[out.length - 1] : prev;
    let guard = 0;
    while (chunk[0] === last && guard++ < 20) chunk = genWords(take, { rand, list: r.list });
    out.push(...chunk); i += take;
  }
  // decorate the lot in one go so sentences run across region boundaries
  return punct || nums ? decorate(out, { rand, punct, nums }) : out;
}

/**
 * WPM over the last SURVIVAL.window words, counting the time since too, so stalling mid-word
 * drags it down. Null until there are enough words since the window last restarted.
 * commits: elapsed seconds at which each word was finished; lens: each word's length;
 * since: index of the first word the window may use; sinceAt: elapsed seconds when it restarted;
 * now: elapsed seconds now.
 */
export function rollingWpm({ commits, lens, since = 0, sinceAt = 0, now }) {
  const n = commits.length, k = SURVIVAL.window;
  if (n - since < k) return null;
  const j = n - k;
  const from = j > since ? commits[j - 1] : sinceAt;
  let chars = 0;
  for (let w = j; w < n; w++) chars += lens[w] + 1; // each word plus its space
  const secs = Math.max(now - from, 0.001);
  return chars / 5 / (secs / 60);
}

/** A life lost. Returns the lives left. */
export const loseLife = (lives) => Math.max(0, lives - 1);
/** Whether a mistake in word w costs a life: only the first one in each word does. */
export const costsLife = (charged, w) => !charged.has(w);

/** After a clean word: whether regen gives a life back, and the clean run after it. */
export function afterCleanWord({ lives, max, run, regen }) {
  run += 1;
  if (regen && lives < max && run >= SURVIVAL.regenEvery) return { lives: lives + 1, run: 0, regained: true };
  return { lives, run, regained: false };
}

/** The settings a run was played with, as stored on the galley and used to key its best. */
export const survivalOpts = (cfg) => ({
  lives: SURVIVAL.lives.includes(cfg.survLives) ? cfg.survLives : 3,
  regen: !!cfg.survRegen,
  floor: SURVIVAL.floors.includes(cfg.survFloor) ? cfg.survFloor : 0
});

/** Short description: "3 lives · regen · floor 30 wpm". */
export const survivalLabel = (s) =>
  [s.lives === 1 ? "1 life" : `${s.lives} lives`, s.regen ? "regen" : "", s.floor ? `floor ${s.floor} wpm` : ""].filter(Boolean).join(" · ");
