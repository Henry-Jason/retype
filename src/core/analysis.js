import { norm } from "./words.js";

export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Score a finished galley from its keystroke log.
 *
 * session: { keys, targets, typed, cur, total, okKeys, best }
 *   keys: [{ w, pos, exp, ch, ok, dt, at, space?, missed? } | { bs: true }]
 *   dt: ms since the previous key, or null when it can't be trusted (first key, after a pause or a correction)
 * secs: active typing time in seconds (pauses excluded)
 *
 * wpm counts only words typed exactly right (plus their spaces), the usual definition.
 * raw counts every key. accuracy is correct keys over all keys, misses that were later fixed included.
 */
export function analyse(session, secs) {
  const { keys, targets, typed, cur } = session;
  secs = Math.max(secs, 0.001);
  const inst = new Map(), bigrams = new Map();
  let errors = 0, corrections = 0, prev = null;
  for (const k of keys) {
    if (k.life) continue; // a survival life lost to the speed floor: not a key
    if (k.bs) { corrections++; prev = k; continue; }
    if (!k.ok) errors++;
    let I = inst.get(k.w);
    if (!I) { I = { errs: 0, lats: [] }; inst.set(k.w, I); }
    if (k.space) { I.errs += k.missed || 0; prev = k; continue; }
    if (k.exp == null) { I.errs++; prev = k; continue; }
    if (!k.ok) I.errs++;
    else if (k.dt != null && k.pos > 0) I.lats.push(k.dt);
    // a pair counts only when its two keys were typed one after the other, the first one correctly
    if (k.pos > 0 && prev && !prev.bs && !prev.space && prev.w === k.w && prev.pos === k.pos - 1 && prev.ok) {
      const tgt = targets[k.w], bg = tgt[k.pos - 1] + tgt[k.pos];
      const B = bigrams.get(bg) || { lats: [], errs: 0, n: 0 };
      B.n++;
      if (k.ok && k.dt != null) B.lats.push(k.dt);
      if (!k.ok) B.errs++;
      bigrams.set(bg, B);
    }
    prev = k;
  }
  const agg = new Map();
  for (const [w, I] of inst) {
    const word = norm(targets[w]);
    const A = agg.get(word) || { word, occ: 0, errs: 0, lats: [] };
    A.occ++; A.errs += I.errs; A.lats.push(...I.lats);
    agg.set(word, A);
  }
  const globalMed = median([...agg.values()].flatMap((a) => a.lats)) || 1;
  const words = [...agg.values()].map((a) => {
    const med = median(a.lats);
    const slow = med != null ? Math.max(0, med / globalMed - 1) : 0;
    return { ...a, med, slow, score: a.errs / a.occ + slow };
  });
  const weak = words.filter((a) => a.score >= 0.2).sort((x, y) => y.score - x.score).slice(0, 10);
  const pairs = [...bigrams.entries()].map(([bg, B]) => {
    const med = median(B.lats);
    return { bg, med, errs: B.errs, n: B.n, score: (med ?? globalMed) * (1 + B.errs / B.n) };
  }).filter((p) => p.n >= 2 || p.errs > 0).sort((x, y) => y.score - x.score).slice(0, 8);

  let chars = 0;
  for (let w = 0; w <= Math.min(cur, targets.length - 1); w++) {
    if (typed[w] === targets[w]) chars += targets[w].length + (w < cur ? 1 : 0);
  }
  const total = session.total, okKeys = session.okKeys;
  return {
    secs,
    wpm: chars / 5 / (secs / 60),
    raw: total / 5 / (secs / 60),
    acc: total ? (okKeys / total) * 100 : 100,
    errors, corrections, keys: total, best: session.best,
    words, weak, pairs, globalMed
  };
}

/** Explain a wrong word the way a proofreader would: the first slip only. */
export function describe(tgt, typed) {
  const show = (c) => (c === " " ? "space" : c), clip = (s) => (s.length > 12 ? s.slice(0, 12) + "…" : s);
  for (let i = 0; i < Math.min(tgt.length, typed.length); i++) {
    if (tgt[i] !== typed[i]) return `${show(tgt[i])}, not ${show(typed[i])}`;
  }
  if (typed.length < tgt.length) return `dropped ${clip(tgt.slice(typed.length))}`;
  return `extra ${clip(typed.slice(tgt.length))}`;
}
