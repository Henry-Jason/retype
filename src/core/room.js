// Friend rooms: private races with a share code. Everything here is pure (no Firebase), so the
// rules of a race can be tested: codes, the settings a room allows, who's in a round, when a
// round is over and who placed where.
//
// A room in the database (see storage/rooms.js and database.rules.json):
//   rooms/{code}: { host, created, settings, round, seed, startAt, state, entrants: {uid: true},
//                   players: {uid: {name, joined, online}}, runs: {round: {uid: run}} }
// state: "lobby" before the first race, "race" while one is on (the countdown included),
// "done" once it's over. A run is what each player reports as they type: see runReport.
import { score } from "./progress.js";

export const ROOM = {
  codeLength: 5,
  maxPlayers: 8,
  countdownMs: 4000,    // from pressing start to the first key
  graceMs: 3000,        // a timed race is called this long after its clock runs out
  wordsCapMs: 10 * 60e3 // a word race nobody finishes is called after ten minutes
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

export const ROOM_PRESETS = { words: [10, 25, 50, 100], time: [15, 30, 60] };
const LISTS = ["200", "1k", "5k", "10k"];

/** Settings a room can race with: words or time, a preset length, a word list, punctuation, numbers. */
export function roomSettings(s = {}) {
  const mode = s.mode === "time" ? "time" : "words";
  const presets = ROOM_PRESETS[mode];
  const length = presets.includes(s.length) ? s.length : mode === "time" ? 30 : 25;
  return { mode, length, list: LISTS.includes(s.list) ? s.list : "200", punct: !!s.punct, nums: !!s.nums };
}

export const settingsLabel = (s) => [s.mode === "time" ? `${s.length} seconds` : `${s.length} words`, `top ${s.list === "200" ? "200" : s.list.replace("k", ",000")}`, s.punct ? "punctuation" : "", s.nums ? "numbers" : ""].filter(Boolean).join(" · ");

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
export function runReport({ chars, words, wpm, acc, done = false, secs = null, at }) {
  const r = { c: Math.max(0, Math.round(chars)), w: words, wpm: Math.round(wpm * 10) / 10, acc: Math.round(acc * 10) / 10, done: !!done, at };
  if (done) { r.secs = Math.round(secs * 100) / 100; r.score = Math.round(score(r.wpm, r.acc) * 100) / 100; }
  return r;
}

/**
 * Is this round over? When everyone who started has finished or gone, when a timed race's clock
 * (plus a little grace) is up, when a word race has run ten minutes, or when the host called it.
 */
export function roundOver(room, serverNow) {
  if (!room || room.state !== "race") return room?.state === "done";
  const runs = room.runs?.[room.round] || {};
  const racing = Object.keys(room.entrants || {}).filter((uid) => room.players?.[uid]?.online && !runs[uid]?.done);
  if (!racing.length) return true;
  const s = room.settings || {};
  const cap = s.mode === "time" ? s.length * 1000 + ROOM.graceMs : ROOM.wordsCapMs;
  return serverNow > (room.startAt || 0) + cap;
}

/**
 * Places for a round. Finishers go by score (wpm × accuracy², the app's one number), ties to the
 * quicker finish; then those still typing (or who stopped), furthest along first.
 * Returns [{ uid, name, place, done, c, w, wpm, acc, score, secs, online, me }].
 */
export function standings(room, round = room?.round, me = null) {
  const runs = room?.runs?.[round] || {};
  const rows = Object.keys(room?.entrants || {}).map((uid) => {
    const r = runs[uid] || { c: 0, w: 0, wpm: 0, acc: 100, done: false };
    return { uid, name: room.players?.[uid]?.name || "Someone", online: !!room.players?.[uid]?.online, me: uid === me, ...r, done: !!r.done };
  });
  rows.sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1)
    : a.done ? (b.score - a.score) || (a.secs - b.secs)
    : (b.c - a.c) || (b.wpm - a.wpm)));
  rows.forEach((r, i) => { r.place = i + 1; });
  return rows;
}

/** "1st", "2nd", "11th". */
export const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
