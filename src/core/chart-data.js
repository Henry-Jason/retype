// Points for the speed chart: one per keystroke.
// actual: correct keys so far, shown from 1s on (before that a single key reads as an absurd speed);
// raw: the last RAW_WINDOW keys, so one fast or slow key doesn't spike the line;
// burst: one value per correct word, from its first key to its space (or last key, for the final word).
export const RAW_WINDOW = 10;

export function chartData(session, secs) {
  const { keys: all, targets, typed, infinite } = session;
  const T = Math.max(secs, 0.5);
  const keys = all.filter((k) => !k.bs && k.at != null);
  const first = new Map(), lastOf = new Map();
  for (const k of keys) { if (!first.has(k.w)) first.set(k.w, k.at); lastOf.set(k.w, k); }
  let ok = 0;
  const pts = keys.map((k, i) => {
    if (k.ok) ok++;
    const s = Math.max(k.at, 0.001), j = Math.max(0, i - RAW_WINDOW + 1), span = k.at - keys[j].at;
    const raw = i - j >= 2 && span > 0 ? (i - j) / 5 / (span / 60) : null;
    let burst = null;
    const endsLast = !infinite && k.w === targets.length - 1 && lastOf.get(k.w) === k;
    if (k.space || endsLast) {
      const len = targets[k.w].length, dur = k.at - first.get(k.w);
      if (typed[k.w] === targets[k.w] && len >= 2 && dur > 0.05) burst = Math.min(len / 5 / (dur / 60), 300);
    }
    return { s, k, act: s >= 1 ? ok / 5 / (s / 60) : null, raw, burst, gap: k.dt };
  });
  return { T, pts };
}
