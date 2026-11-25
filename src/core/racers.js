// Ghost racers for quick races: when nobody else is around, you race replays of real players'
// recent runs of the same kind (or, until there are any, house ghosts typing at a steady pace).
// Pure, so the server (which collects the runs) and the browser (which races them) agree.
//
// A ghost in a room (rooms/{code}/ghosts/{gid}), raced by every browser from the same startAt:
//   a run:  { name, wpm, acc, words, secs, keys: "<packed keystrokes as JSON>", targets: [...] }
//   a pace: { name, wpm, acc, words, pace: true }   (house ghosts; words: where a survival one goes out)
// The pool the runs come from: ghosts/{mode}/runs/{uid} in Firestore, one per player per kind,
// their latest qualifying run, written only by the collectGhost Cloud Function.
import { score } from "./progress.js";
import { ghostTimeline, charsAt, timeAt } from "./ghost.js";

export const GHOSTS = {
  perRace: 3,
  waitMs: 8000,      // alone in a new public room this long, and the ghosts come out
  minWpm: 15, maxWpm: 250,
  maxKeys: 4000,     // longer runs (long survival) aren't worth sending to every racer
  houseNames: ["The night editor", "A copy boy", "The sub-editor", "The proofreader", "The typesetter", "A stringer"]
};

/** Which quick race a finished galley could haunt, or null. Matches QUICK in core/room.js. */
export function quickKind(r) {
  if (!r || r.sudden || r.punct || r.nums) return null;
  if (r.mode === "words" && r.length === 25 && r.list === "200" && r.wordsDone >= 25) return "words";
  if (r.mode === "time" && r.length === 30 && r.list === "200" && r.wordsDone >= 5) return "time";
  if (r.mode === "quote" && r.length >= 5 && r.length <= 20 && r.wordsDone >= r.length) return "quote";
  if (r.mode === "survival" && r.surv && r.surv.lives === 3 && r.surv.floor === 30 && !r.surv.regen && r.wordsDone >= 10) return "survival";
  return null;
}

/** The pool entry for a checked run: { mode, doc } or null when it isn't one. */
export function poolEntry({ uid, result, name, wpm, acc, now }) {
  const mode = quickKind(result);
  if (!mode || result.lend === false) return null;
  const keys = typeof result.keys === "string" ? result.keys : JSON.stringify(result.keys || []);
  if (!(wpm >= GHOSTS.minWpm && wpm <= GHOSTS.maxWpm)) return null;
  if ((keys.match(/\],\[/g) || []).length + 1 > GHOSTS.maxKeys) return null;
  return {
    mode,
    doc: { uid, name: name || "A typist", wpm: Math.round(wpm * 10) / 10, acc: Math.round(acc * 10) / 10, words: result.wordsDone, secs: Math.round((result.secs || 0) * 100) / 100, keys, targets: result.targets.slice(0, result.wordsDone + 1), at: now }
  };
}

/**
 * Up to n ghosts from the pool for someone who types at about `wpm`: one run per player, never
 * their own, the closest in speed first (so there's a race), then shuffled into speed order.
 */
export function pickGhosts(pool, { me, wpm, n = GHOSTS.perRace }) {
  const seen = new Set();
  const runs = (pool || []).filter((g) => g.uid !== me && g.keys && Array.isArray(g.targets) && !seen.has(g.uid) && seen.add(g.uid));
  runs.sort((a, b) => Math.abs(Math.log(a.wpm / wpm)) - Math.abs(Math.log(b.wpm / wpm)));
  return runs.slice(0, n).sort((a, b) => b.wpm - a.wpm)
    .map((g) => ({ name: g.name, wpm: g.wpm, acc: g.acc, words: g.words, secs: g.secs, keys: g.keys, targets: g.targets }));
}

/** House ghosts around your pace, for when the pool is thin: a bit slower, level, a bit quicker. */
export function houseGhosts(mode, wpm, n, rand = Math.random) {
  const paces = [0.85, 1, 1.15, 0.7, 1.3].slice(0, n);
  const names = GHOSTS.houseNames.slice().sort(() => rand() - 0.5);
  return paces.map((f, i) => {
    const w = Math.max(20, Math.round(wpm * f));
    return { name: names[i], wpm: w, acc: 97, pace: true, words: mode === "survival" ? Math.round(30 + w * 0.8) : null };
  });
}

/** Room ghosts for a race: the pool first, house ghosts to make up the numbers. Keyed g0, g1… */
export function raceGhosts({ pool, mode, me, wpm, n = GHOSTS.perRace, rand }) {
  const picked = pickGhosts(pool, { me, wpm, n });
  const all = [...picked, ...houseGhosts(mode, wpm, n - picked.length, rand)];
  return Object.fromEntries(all.map((g, i) => [`g${i}`, g]));
}

/** A ghost's timeline: replayed keystrokes, or a steady pace (5 characters a word). */
export function ghostTrack(g) {
  if (g.pace) {
    const perMs = (g.wpm * 5) / 60000;
    if (g.words != null) { const reach = g.words * 6, end = reach / perMs; return { tl: { pts: [[0, 0], [end, reach]], end, reach, total: reach }, carry: false, survEnd: end }; }
    return { tl: { pts: [[0, 0], [60000, perMs * 60000]], end: 60000, reach: perMs * 60000, total: Infinity }, carry: true };
  }
  let keys = g.keys;
  if (typeof keys === "string") { try { keys = JSON.parse(keys); } catch { keys = []; } }
  const targets = Array.isArray(g.targets) ? g.targets : Object.values(g.targets || {});
  const tl = ghostTimeline(keys, targets);
  return { tl, carry: tl.reach >= tl.total, survEnd: tl.end };
}

/**
 * Where a ghost is `ms` into a race, as a run like the ones players send (see runReport):
 * { c, w, wpm, acc, done, secs, score, l }. total: characters in this race's text (Infinity for
 * time and survival); limitMs: a timed race's length.
 */
export function ghostRun(g, track, ms, { mode, total = Infinity, limitMs = Infinity }) {
  const { tl, carry } = track;
  const rate = tl.reach / Math.max(tl.end, 1);
  // never past where it stops: its clock, its last life, or its finish (so ms = Infinity means "how it ends")
  const finish = carry && total > tl.reach ? tl.end + (total - tl.reach) / rate : timeAt(tl, total);
  ms = Math.min(ms, mode === "time" ? limitMs : mode === "survival" ? track.survEnd : finish);
  const raw = carry && ms > tl.end ? tl.reach + (ms - tl.end) * rate : charsAt(tl, Math.max(0, ms));
  const c = Math.max(0, Math.min(raw, total));
  let done = false, secs = null;
  if (mode === "time") { done = ms >= limitMs; if (done) secs = limitMs / 1000; }
  else if (mode === "survival") { done = ms >= track.survEnd; if (done) secs = track.survEnd / 1000; }
  else if (c >= total) { done = true; secs = finish / 1000; }
  const perWord = tl.reach / Math.max(g.words || tl.reach / 6, 1);
  const w = mode === "survival" && done ? g.words : Math.max(0, Math.floor(c / perWord));
  const run = { c: Math.round(c), w: mode === "survival" ? Math.min(w, g.words ?? w) : w, wpm: g.wpm, acc: g.acc, done };
  if (done) { run.secs = Math.round(secs * 100) / 100; run.score = Math.round(score(g.wpm, g.acc) * 100) / 100; }
  if (mode === "survival") run.l = done ? 0 : 1;
  return run;
}

/**
 * The room as it looks with this round's ghosts racing in it, `ms` after the start: each ghost
 * is an entrant, a player (marked as a ghost) and a run. Once every real player is done (or the
 * round is), the ghosts are shown as they end: nobody waits a minute for a ghost to run out of
 * lives. Rooms without ghosts come back as they are.
 * tracks: a Map gid → ghostTrack, kept by the caller so a timeline is only built once.
 */
export function withGhosts(room, ms, tracks, ctx) {
  if (!room?.ghosts || room.state === "lobby") return room;
  const round = room.round, entrants = { ...room.entrants }, players = { ...room.players }, runs = { ...(room.runs?.[round] || {}) };
  const humansDone = Object.keys(room.entrants || {}).every((uid) => runs[uid]?.done || !players[uid]?.online);
  if (room.state === "done" || humansDone) ms = Infinity;
  for (const [gid, g] of Object.entries(room.ghosts)) {
    if (!tracks.has(gid)) tracks.set(gid, ghostTrack(g));
    entrants[gid] = true;
    players[gid] = { name: `${g.name} · ghost`, joined: 0, online: true, ghost: true };
    runs[gid] = ghostRun(g, tracks.get(gid), ms, ctx);
  }
  return { ...room, entrants, players, runs: { ...room.runs, [round]: runs } };
}
