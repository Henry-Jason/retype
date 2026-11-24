// Ghost races: a past run replayed from its keystroke log as a second caret on the galley.
// Pure, so it can be tested. A run becomes a timeline of how far along its text it was (in
// characters, spaces included), and that distance is laid onto whatever you're typing now:
// on the same words the ghost is exactly where it was; on different words (racing your best
// on a fresh galley) it moves at the same pace in characters.

/** Where each word starts, counting one space after every word. starts[n] is one past the end. */
export function wordStarts(targets) {
  const s = [0];
  for (const t of targets) s.push(s[s.length - 1] + t.length + 1);
  return s;
}

/** Characters in a text: every letter and the spaces between words (not one after the last). */
export const textLength = (targets) => Math.max(0, wordStarts(targets)[targets.length] - 1);

/**
 * Replay a packed keystroke log ([word, pos, char, ok, ms, flags], see result.js) into a timeline
 * of [ms, chars] points. Wrong letters move the caret as they did on screen; a backspace steps it
 * back one letter, or into the previous word when it's at the start of one. Lives lost to the
 * survival speed floor (flag 4) don't move it.
 */
export function ghostTimeline(keys, targets) {
  const starts = wordStarts(targets), len = [];
  let w = 0;
  const pts = [[0, 0]];
  const where = () => {
    const wi = Math.min(w, targets.length);
    return starts[wi] + Math.min(len[wi] || 0, targets[wi]?.length ?? 0);
  };
  for (const k of keys) {
    const [kw, pos, , , ms, flags] = k;
    if (flags === 4) continue;
    if (flags === 2) {
      if ((len[w] || 0) > 0) len[w]--;
      else if (w > 0) w--; // back into the previous word, which keeps what was typed in it
    } else if (flags === 1) { w = kw + 1; len[w] = 0; }
    else { w = kw; len[w] = pos + 1; }
    pts.push([Math.max(ms, pts[pts.length - 1][0]), where()]);
  }
  const last = pts[pts.length - 1];
  return { pts, end: last[0], reach: last[1], total: textLength(targets) };
}

/** How far along the ghost is at ms. Glides between keystrokes going forward; steps back on a backspace. */
export function charsAt(tl, ms) {
  const p = tl.pts;
  if (ms <= 0) return 0;
  if (ms >= tl.end) return p[p.length - 1][1];
  let lo = 0, hi = p.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (p[mid][0] <= ms) lo = mid; else hi = mid - 1; }
  const a = p[lo], b = p[lo + 1];
  if (!b || b[1] < a[1] || b[0] === a[0]) return a[1];
  return a[1] + (b[1] - a[1]) * ((ms - a[0]) / (b[0] - a[0]));
}

/** When the ghost first got that far, in ms. Past the end of its run, carried on at its average pace. */
export function timeAt(tl, chars) {
  if (chars <= 0) return 0;
  const p = tl.pts;
  for (let i = 1; i < p.length; i++) {
    if (p[i][1] >= chars) {
      const a = p[i - 1], b = p[i];
      return b[1] === a[1] ? b[0] : a[0] + (b[0] - a[0]) * Math.max(0, (chars - a[1]) / (b[1] - a[1]));
    }
  }
  const rate = tl.reach / Math.max(tl.end, 1); // chars per ms over the whole run
  return rate > 0 ? tl.end + (chars - tl.reach) / rate : Infinity;
}

/** Where a distance lands in a text: { w, p }, p being the letter the caret sits before. */
export function place(chars, starts, targets) {
  const n = targets.length;
  if (!n) return { w: 0, p: 0 };
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= chars) lo = mid; else hi = mid - 1; }
  return { w: lo, p: Math.max(0, Math.min(targets[lo].length, Math.floor(chars - starts[lo]))) };
}

/** Your lead over the ghost in seconds: positive when it gets where you are later than you did. */
export function leadSecs(tl, myChars, myMs) {
  if (myChars <= 0) return 0;
  const t = timeAt(tl, myChars);
  return Number.isFinite(t) ? (t - myMs) / 1000 : Infinity;
}

/** "+1.2s", "−0.4s", "level". */
export function fmtLead(s) {
  if (!Number.isFinite(s)) return s > 0 ? "way ahead" : "behind";
  if (Math.abs(s) < 0.05) return "level";
  return `${s > 0 ? "+" : "−"}${Math.abs(s).toFixed(1)}s`;
}
