import W200 from "../data/words-200.js";
import W1K from "../data/words-1k.js";
import W5K from "../data/words-5k.js";
import { pick } from "./rng.js";

export const LISTS = {
  "200": { label: "Top 200", words: W200 },
  "1k": { label: "Top 1,000", words: W1K },
  "5k": { label: "Top 5,000", words: W5K }
};

/**
 * Generate a galley of n words.
 * weak/ratio: in a mixed galley, that share of words is drawn from the weak list instead.
 * The same word never appears twice in a row.
 */
export function genWords(n, { rand, list = "200", weak = null, ratio = 0, punct = false, nums = false } = {}) {
  const pool = (LISTS[list] || LISTS["200"]).words;
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 50) {
    const w = weak && weak.length && rand() < ratio ? pick(rand, weak) : pick(rand, pool);
    if (w !== out[out.length - 1]) out.push(w);
  }
  return decorate(out, { rand, punct, nums });
}

/** Optional capitals, punctuation and numbers. The last word always ends a sentence when punctuation is on. */
export function decorate(list, { rand, punct = false, nums = false }) {
  if (!punct && !nums) return list;
  let cap = true;
  return list.map((w, i) => {
    let x = w;
    if (nums && rand() < 0.1) x = String(1 + Math.floor(rand() * (rand() < 0.6 ? 99 : 2026)));
    if (punct) {
      if (cap && /^[a-z]/.test(x)) x = x[0].toUpperCase() + x.slice(1);
      cap = false;
      if (i === list.length - 1) x += ".";
      else {
        const r = rand();
        if (r < 0.08) { x += "."; cap = true; }
        else if (r < 0.1) { x += "?"; cap = true; }
        else if (r < 0.2) x += ",";
      }
    }
    return x;
  });
}

/** The bare word, for grouping: "Order," and "order" are the same word. */
export const norm = (w) => w.replace(/[^a-z0-9']/gi, "").toLowerCase() || w;

/** Shuffle so that repeated words are spread out rather than bunched together. */
export function shuffleSpread(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 1; i < a.length; i++) {
      if (a[i] !== a[i - 1]) continue;
      for (let j = 0; j < a.length; j++) {
        const ok = (k, v) => (k <= 0 || a[k - 1] !== v) && (k >= a.length - 1 || a[k + 1] !== v);
        if (j !== i && a[j] !== a[i] && ok(j, a[i]) && ok(i, a[j])) { [a[i], a[j]] = [a[j], a[i]]; break; }
      }
    }
  }
  return a;
}

/** Words from a list that contain any of the given letter pairs (for a pair drill). */
export function pairDrill(pairs, { rand, list = "1k", n = 30 }) {
  const top = pairs.slice(0, 4).map((p) => p.toLowerCase());
  if (!top.length) return null;
  const pool = (LISTS[list] || LISTS["1k"]).words.filter((w) => w.length > 2 && top.some((bg) => w.includes(bg)));
  if (pool.length < 4) return null;
  const words = [];
  while (words.length < n) {
    const w = pick(rand, pool);
    if (w !== words[words.length - 1]) words.push(w);
  }
  return { words, pairs: top };
}
