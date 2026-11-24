// Friend rooms: private races with a share code. Everything here is pure (no Firebase), so the
// rules of a race can be tested: codes, the settings a room allows, who's in a round, when a
// round is over and who placed where.
//
// A room in the database (see storage/rooms.js and database.rules.json):
//   rooms/{code}: { host, created, public, settings, round, seed, startAt, state, quote, autoAt,
//                   entrants: {uid: true}, players: {uid: {name, joined, online}}, runs: {round: {uid: run}} }
//   lobby/{code}: { mode, n, state, at }   public rooms only, kept up to date by their host
// Four kinds of race: words, time, a quote (the host's browser picks it and puts it in the room),
// and survival (last one standing, on the same endless words).
// state: "lobby" before the first race, "race" while one is on (the countdown included),
// "done" once it's over. A run is what each player reports as they type: see runReport.
import { score } from "./progress.js";

export const ROOM = {
  codeLength: 5,
  maxPlayers: 8,
  countdownMs: 4000,    // from pressing start to the first key
  graceMs: 3000,        // a timed race is called this long after its clock runs out
  wordsCapMs: 10 * 60e3, // a word race nobody finishes is called after ten minutes
  survivalCapMs: 30 * 60e3,
  autoStartMs: 10000,    // public rooms: the next race starts this long after there are two of you
  lobbyFreshMs: 60 * 60e3 // a public room not touched for an hour isn't offered to quick races
};

// no 0/O, 1/I/L: codes get read out loud
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-HJKMNP-Z2-9]{5}$/;

export function newCode(rand = Math.random) {
  let c = "";
  for (let i = 0; i < ROOM.codeLength; i++) c += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return c;
}

/** A typed or pasted code, or an invite link, as a room code; null if it can't be one. */
export function readCode(s) {
  const m = String(s || "").toUpperCase().match(/(?:ROOM=)?([A-Z0-9]{5})\s*$/);
  const c = m ? m[1] : "";
  return CODE_RE.test(c) ? c : null;
}

export const ROOM_MODES = ["words", "time", "quote", "survival"];
export const ROOM_PRESETS = { words: [10, 25, 50, 100], time: [15, 30, 60], quoteLen: ["any", "short", "medium", "long"], lives: [1, 3, 5], floor: [0, 20, 30, 40] };
const LISTS = ["200", "1k", "5k", "10k"];
const pickOr = (list, v, d) => (list.includes(v) ? v : d);

/**
 * Settings a room can race with. Every field is always there, whatever the mode, so a host can
 * flip between modes without losing their choices: length (words or seconds), quoteLen, lives
 * and floor (survival), the word list, punctuation and numbers.
 */
export function roomSettings(s = {}) {
  const mode = pickOr(ROOM_MODES, s.mode, "words");
  const presets = mode === "time" ? ROOM_PRESETS.time : ROOM_PRESETS.words;
  const length = presets.includes(s.length) ? s.length : mode === "time" ? 30 : 25;
  return {
    mode, length, quoteLen: pickOr(ROOM_PRESETS.quoteLen, s.quoteLen, "any"),
    lives: pickOr(ROOM_PRESETS.lives, s.lives, 3), floor: pickOr(ROOM_PRESETS.floor, s.floor, 30),
    list: pickOr(LISTS, s.list, "200"), punct: !!s.punct, nums: !!s.nums
  };
}

const listLabel = (l) => `top ${l === "200" ? "200" : l.replace("k", ",000")}`;
export function settingsLabel(s) {
  const extras = [s.punct ? "punctuation" : "", s.nums ? "numbers" : ""];
  if (s.mode === "quote") return ["a quote", s.quoteLen && s.quoteLen !== "any" ? s.quoteLen : ""].filter(Boolean).join(" · ");
  if (s.mode === "survival") return ["survival", `${s.lives} ${s.lives === 1 ? "life" : "lives"}`, s.floor ? `${s.floor} wpm floor` : "no floor", ...extras].filter(Boolean).join(" · ");
  return [s.mode === "time" ? `${s.length} seconds` : `${s.length} words`, listLabel(s.list), ...extras].filter(Boolean).join(" · ");
}

/** The galley options a race in this room types with (the shape newTest takes). */
export function raceOpts(s) {
  if (s.mode === "survival") return { mode: "survival", surv: { lives: s.lives, regen: false, floor: s.floor }, punct: s.punct, nums: s.nums, sudden: false };
  if (s.mode === "quote") return { mode: "quote", sudden: false };
  return { mode: s.mode, length: s.length, list: s.list, punct: s.punct, nums: s.nums, sudden: false };
}

/** Players in joining order, with the host first among equals: [{ uid, name, joined, online }]. */
export function playerList(room) {
  return Object.entries(room?.players || {}).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => (a.joined || 0) - (b.joined || 0) || (a.uid < b.uid ? -1 : 1));
}

/** Who should take over when the host has gone: the longest-standing player still here. */
export function nextHost(room) {
  if (room?.players?.[room.host]?.online) return room.host;
  return playerList(room).find((p) => p.online)?.uid ?? null;
}

/** What a player sends while racing: how far along (characters, as core/ghost.js counts them), words, speed, accuracy. */
export function runReport({ chars, words, wpm, acc, done = false, secs = null, lives = null, at }) {
  const r = { c: Math.max(0, Math.round(chars)), w: words, wpm: Math.round(wpm * 10) / 10, acc: Math.round(acc * 10) / 10, done: !!done, at };
  if (lives != null) r.l = lives;
  if (done) { r.secs = Math.round(secs * 100) / 100; r.score = Math.round(score(r.wpm, r.acc) * 100) / 100; }
  return r;
}

/**
 * Is this round over? When everyone who started has finished or gone, when a timed race's clock
 * (plus a little grace) is up, when a word race has run ten minutes, when the host called it, or
 * in survival when the last one standing has outlasted everyone.
 */
export function roundOver(room, serverNow) {
  if (!room || room.state !== "race") return room?.state === "done";
  const runs = room.runs?.[room.round] || {};
  const racing = Object.keys(room.entrants || {}).filter((uid) => room.players?.[uid]?.online && !runs[uid]?.done);
  if (!racing.length) return true;
  const s = room.settings || {};
  // survival with company: over once one player is left standing and has gone past everyone else
  const entrants = Object.keys(room.entrants || {});
  if (s.mode === "survival" && entrants.length > 1 && racing.length === 1) {
    const far = Math.max(...entrants.filter((u) => u !== racing[0]).map((u) => runs[u]?.w || 0));
    if ((runs[racing[0]]?.w || 0) > far) return true;
  }
  const cap = s.mode === "time" ? s.length * 1000 + ROOM.graceMs : s.mode === "survival" ? ROOM.survivalCapMs : ROOM.wordsCapMs;
  return serverNow > (room.startAt || 0) + cap;
}

/**
 * Places for a round. Finishers go by score (wpm × accuracy², the app's one number), ties to the
 * quicker finish; then those still typing (or who stopped), furthest along first.
 * Survival is last one standing: anyone still alive is ahead of everyone who's out, and the rest
 * go by words survived, then score.
 * Returns [{ uid, name, place, done, c, w, wpm, acc, score, secs, online, me }].
 */
export function standings(room, round = room?.round, me = null) {
  const runs = room?.runs?.[round] || {};
  const rows = Object.keys(room?.entrants || {}).map((uid) => {
    const r = runs[uid] || { c: 0, w: 0, wpm: 0, acc: 100, done: false };
    return { uid, name: room.players?.[uid]?.name || "Someone", online: !!room.players?.[uid]?.online, me: uid === me, ...r, done: !!r.done };
  });
  if (room?.settings?.mode === "survival") {
    const alive = (r) => !r.done && r.online;
    rows.sort((a, b) => (alive(b) - alive(a)) || (b.w - a.w) || ((b.score ?? 0) - (a.score ?? 0)) || (b.c - a.c));
    rows.forEach((r, i) => { r.place = i + 1; });
    return rows;
  }
  rows.sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1)
    : a.done ? (b.score - a.score) || (a.secs - b.secs)
    : (b.c - a.c) || (b.wpm - a.wpm)));
  rows.forEach((r, i) => { r.place = i + 1; });
  return rows;
}

/** "1st", "2nd", "11th". */
export const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

/* ---------- quick races: public rooms ---------- */

/**
 * The public room to put someone in for a quick race of this mode, from the lobby list
 * ({ code: { mode, n, state, at } }): the fullest one with space, then the newest. Null: make one.
 */
export function pickOpenRoom(lobby, mode, now) {
  const open = Object.entries(lobby || {})
    .map(([code, e]) => ({ code, ...e }))
    .filter((e) => CODE_RE.test(e.code) && e.mode === mode && e.n >= 1 && e.n < ROOM.maxPlayers && now - (e.at || 0) < ROOM.lobbyFreshMs);
  open.sort((a, b) => (a.state === "race") - (b.state === "race") || b.n - a.n || b.at - a.at);
  return open[0]?.code ?? null;
}

/** What a public room's host keeps in the lobby list. */
export const lobbyEntry = (room, at) => ({ mode: room.settings.mode, n: Object.values(room.players || {}).filter((p) => p.online).length, state: room.state, at });

/** Quick-race settings: one standard galley per mode, so everyone in a queue races the same thing. */
export const QUICK = {
  words: roomSettings({ mode: "words", length: 25 }),
  time: roomSettings({ mode: "time", length: 30 }),
  quote: roomSettings({ mode: "quote", quoteLen: "short" }),
  survival: roomSettings({ mode: "survival", lives: 3, floor: 30 })
};
