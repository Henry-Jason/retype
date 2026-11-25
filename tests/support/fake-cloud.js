import { totalPp } from "../../src/core/pp.js";
import { screenQuote, submission, sharedId, existingVerdict, review, report, screenName, fallbackName, safeName } from "../../src/core/moderation.js";
// An in-memory stand-in for Firebase, used by `vite build --mode uitest` to check the
// account interface in a browser. Never part of a normal build.
export function createFakeCloud() {
  const KEY = "retype-fake-cloud";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { accounts: {}, results: {}, user: null }; } catch { return { accounts: {}, results: {}, user: null }; } };
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  let listener = null;
  // ?as=Ana signs this tab in as its own player, for racing a friend room against another tab
  const as = new URLSearchParams(location.search).get("as");
  const me = as ? { uid: "u-" + as.toLowerCase(), name: as, email: `${as.toLowerCase()}@example.com`, photo: "" } : { uid: "test-uid", name: "Henry Test", email: "henry@example.com", photo: "" };
  let rooms = null;
  return {
    onUser(cb) { listener = cb; setTimeout(() => cb(as ? me : load().user), 0); return () => {}; },
    async signIn() { if (!as) { const d = load(); d.user = me; save(d); } listener?.(me); },
    async signOut() { if (!as) { const d = load(); d.user = null; save(d); } listener?.(null); },
    async rooms() { return (rooms ??= createFakeRooms()); },
    async getAccount(uid) { return load().accounts[uid] ?? null; },
    async foldAccount(uid, fn) { const d = load(); const next = fn(d.accounts[uid] ?? null); d.accounts[uid] = next; save(d); return next; },
    async putResult(uid, r) { const d = load(); d.results[uid] ??= {}; d.results[uid][r.id] ??= r; save(d); },
    // ghosts as collectGhost would file them, from every fake player's saved galleys
    async ghostPool(mode) {
      const { poolEntry } = await import("../../src/core/racers.js");
      const out = [];
      for (const [uid, rs] of Object.entries(load().results || {})) {
        const latest = Object.values(rs).map((r) => poolEntry({ uid, result: r, name: (load().profiles || {})[uid]?.name || "A typist", wpm: r.wpm, acc: r.acc, now: r.at })).filter((e) => e?.mode === mode).sort((a, b) => b.doc.at - a.doc.at)[0];
        if (latest) out.push(latest.doc);
      }
      return out;
    },
    async recentResults(uid, n) { return Object.values(load().results[uid] || {}).sort((a, b) => b.at - a.at).slice(0, n); },
    async getProfile(uid) { return (load().profiles || {})[uid] ?? null; },
    // like the setName Cloud Function: the server's name filter, and a fallback on request
    async setName(raw, { fallback = false } = {}) {
      const r = screenName(raw);
      if (!r.ok && !fallback) throw Object.assign(new Error(r.reason), { code: "functions/invalid-argument" });
      const name = r.ok ? r.name : fallbackName(me.uid);
      const d = load(); d.profiles ??= {}; d.profiles[me.uid] = { name }; save(d); return name;
    },
    // the board as the Cloud Function would fill it, seeded with two rivals
    async dailyBoard(day) {
      const d = load(), mine = Object.values(d.results["test-uid"] || {}).filter((r) => r.kind === "daily" && r.day === day).sort((a, b) => a.at - b.at)[0];
      const rows = [{ uid: "r1", name: "Ana", wpm: 88, acc: 99.1, score: 86.4, clean: false }, { uid: "r2", name: "Ben", wpm: 64, acc: 100, score: 64, clean: true }];
      if (mine) rows.push({ uid: "test-uid", resultId: mine.id, name: (d.profiles || {})["test-uid"]?.name || "Typist", wpm: mine.wpm, acc: mine.acc, score: mine.score, clean: mine.clean });
      return rows.sort((a, b) => b.score - a.score);
    },
    async dailyEntry(day, uid) { return (await this.dailyBoard(day)).find((r) => r.uid === uid) || null; },
    async dailyPlace(day, score) { const b = await this.dailyBoard(day); return { place: b.filter((r) => r.score > score).length + 1, of: b.length }; },
    // the PP board as the Cloud Function would keep it (from the browser's own numbers here)
    async ppBoard() {
      const d = load(), mine = d.accounts["test-uid"];
      const rows = [{ uid: "r1", name: "Ana", pp: 1840.5, best: 140.2, count: 100 }, { uid: "r2", name: "Ben", pp: 612.3, best: 61, count: 40 }];
      if (mine?.top?.length) rows.push({ uid: "test-uid", name: (d.profiles || {})["test-uid"]?.name || "Typist", pp: totalPp(mine.top), best: mine.top[0].pp, count: mine.top.length, plays: mine.top, backfilled: !!d.backfilled });
      return rows.sort((a, b) => b.pp - a.pp);
    },
    async ppAbove(pp) { return (await this.ppBoard()).filter((r) => r.pp > pp).sort((a, b) => a.pp - b.pp)[0] || null; },
    async ppEntry(uid) { return (await this.ppBoard()).find((r) => r.uid === uid) || null; },
    async ppPlace(pp) { const b = await this.ppBoard(); return { place: b.filter((r) => r.pp > pp).length + 1, of: b.length }; },
    async backfillPp() { const d = load(); d.backfilled = (d.backfilled || 0) + 1; save(d); return { already: false }; },
    // shared quotes, run through the same filter and rules the Cloud Functions use; the test
    // user is an admin, and two rivals have quotes live and waiting
    seedQuotes(d) {
      if (d.quotes) return d.quotes;
      const mk = (text, source, by, uid, name, status) => ({ ...submission({ quote: screenQuote({ text, source, by }).quote, flags: screenQuote({ text, source, by }).flags, uid, name, now: 1 }), status });
      d.quotes = Object.fromEntries([
        mk("The night is darkest just before the dawn, and I promise you the dawn is coming.", "Test Film", "Somebody", "r1", "Ana", "approved"),
        mk("Some days you just have to keep going until the work is done.", "Test Show", "", "r2", "Ben", "approved"),
        mk("This one is waiting for an admin to look at it today.", "Queue Test", "", "r2", "Ben", "pending")
      ].map((q) => [q.id, q]));
      return d.quotes;
    },
    async approvedQuotes() { const d = load(), q = this.seedQuotes(d); save(d); return Object.values(q).filter((x) => x.status === "approved"); },
    async myShared(uid) { const d = load(); return Object.values(this.seedQuotes(d)).filter((x) => x.uid === uid); },
    async isAdmin(uid) { return uid === "test-uid"; },
    async quoteQueue() { const d = load(); return Object.values(this.seedQuotes(d)).filter((x) => x.status === "pending" || x.status === "hidden" || x.reports > 0).map((x) => ({ ...x, reportList: x.reportList || [] })); },
    async submitQuotes(list) {
      const d = load(), q = this.seedQuotes(d);
      const results = list.map((raw) => {
        const s = screenQuote(raw); if (!s.ok) return { ok: false, reason: s.reason };
        const id = sharedId(s.quote.text);
        if (q[id]) return { id, ok: false, reason: existingVerdict(q[id], "test-uid") };
        // the test user is an admin, so (like the real function) their quotes go straight live
        q[id] = submission({ quote: s.quote, flags: s.flags, uid: "test-uid", name: (d.profiles || {})["test-uid"]?.name || "", now: Date.now(), status: "approved" });
        return { id, ok: true, live: true };
      });
      save(d); return { results };
    },
    async withdrawQuote(id) { const d = load(); delete this.seedQuotes(d)[id]; save(d); return { ok: true }; },
    async reportQuote(id, reason) {
      const d = load(), q = this.seedQuotes(d);
      const r = report(q[id], { uid: "test-uid", reason, already: (q[id]?.reportList || []).some((x) => x.uid === "test-uid") });
      if (r.error) throw Object.assign(new Error(r.error), { code: "failed-precondition" });
      if (r.counted) q[id] = { ...r.doc, reportList: [...(q[id].reportList || []), { uid: "test-uid", reason, at: Date.now() }] };
      save(d); return { ok: true, hidden: r.doc.status === "hidden" };
    },
    async reviewQuote(id, action, extra = {}) {
      const d = load(), q = this.seedQuotes(d);
      const r = review(q[id], { action, ...extra }, Date.now());
      if (r.error) throw Object.assign(new Error(r.error), { code: "failed-precondition" });
      q[id] = action === "restore" ? { ...r.doc, reportList: [] } : r.doc; save(d); return { ok: true, quote: r.doc };
    },
    async getSaved(uid) { return (load().saved || {})[uid] ?? null; },
    async foldSaved(uid, fn) { const d = load(); d.saved ??= {}; const next = fn(d.saved[uid] ?? null); d.saved[uid] = { v: 1, ...next, updated: Date.now() }; save(d); return next; },
    async deleteAll(uid) { const d = load(); delete d.accounts[uid]; delete d.results[uid]; save(d); }
  };
}

// Friend rooms in localStorage, shared between tabs of the same browser through storage events,
// with the same API as storage/rooms.js. Each player entry, run and room field is its own key, so
// tabs writing at once don't overwrite each other (as with separate paths in the real database).
// No rules are enforced here; database.rules.json has its own tests.
function createFakeRooms() {
  const PRE = "retype-fake-room:", LOBBY = "retype-fake-lobby:";
  const unit = (parts) => parts.slice(0, parts[0] === "players" ? 2 : parts[0] === "runs" ? 3 : 1);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  function load(code) {
    let room = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith(PRE + code + "/")) continue;
      const parts = k.slice(PRE.length + code.length + 1).split("/");
      let o = (room ??= {});
      for (const p of parts.slice(0, -1)) o = o[p] ??= {};
      o[parts.at(-1)] = read(k);
    }
    return room;
  }
  const watchers = new Set();
  const notify = () => { for (const w of watchers) w(); };
  addEventListener("storage", (e) => { if (e.key?.startsWith(PRE)) notify(); });
  // write a value at a path inside a room, touching only the keys it lands in
  function put(code, path, val) {
    const parts = path.split("/"), u = unit(parts);
    if (u.length < parts.length || (val && typeof val === "object" && (parts[0] === "players" ? parts.length < 2 : parts[0] === "runs" ? parts.length < 3 : false))) {
      if (u.length < parts.length) { // inside a unit: read, change, write it back
        const k = PRE + code + "/" + u.join("/"), cur = read(k) || {};
        let o = cur; for (const p of parts.slice(u.length, -1)) o = o[p] ??= {};
        o[parts.at(-1)] = val; localStorage.setItem(k, JSON.stringify(cur)); return;
      }
      for (const [k, v] of Object.entries(val)) put(code, `${path}/${k}`, v); return; // above a unit: spread
    }
    const k = PRE + code + "/" + parts.join("/");
    if (val === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(val));
  }
  const done = () => setTimeout(notify, 15);
  let here = null;
  addEventListener("pagehide", () => { if (here) put(here.code, `players/${here.uid}/online`, false); });
  return {
    serverNow: () => Date.now(),
    async create(code, { uid, name, settings, open = false }) {
      if (load(code)) return { error: "taken" };
      for (const [k, v] of Object.entries({ host: uid, created: Date.now(), settings, round: 0, state: "lobby", public: open })) put(code, k, v);
      if (open) localStorage.setItem(LOBBY + code, JSON.stringify({ mode: settings.mode, n: 1, state: "lobby", at: Date.now() }));
      put(code, `players/${uid}`, { name: safeName(name, uid), joined: Date.now(), online: true });
      here = { code, uid }; done(); return { ok: true };
    },
    async join(code, { uid, name }) {
      const r = load(code);
      if (!r) return { error: "There's no room with that code." };
      put(code, `players/${uid}`, { name: safeName(name, uid), joined: r.players?.[uid]?.joined ?? Date.now(), online: true }); // as screenRoomName would
      here = { code, uid }; done(); return { ok: true };
    },
    watch(code, cb) {
      const w = () => cb(load(code));
      watchers.add(w); setTimeout(w, 0);
      return () => watchers.delete(w);
    },
    async leave(code, uid) { here = null; put(code, `players/${uid}/online`, false); done(); },
    async update(code, patch) {
      if (!load(code)) return;
      for (const [k, v] of Object.entries(patch)) {
        if (k === "entrants") for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key?.startsWith(PRE + code + "/entrants")) localStorage.removeItem(key); }
        put(code, k, v);
      }
      done();
    },
    async report(code, round, uid, run) { put(code, `runs/${round}/${uid}`, run); done(); },
    async lobby() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LOBBY)) out[k.slice(LOBBY.length)] = read(k); }
      return out;
    },
    async list(code, entry) { if (entry) localStorage.setItem(LOBBY + code, JSON.stringify({ ...entry, at: Date.now() })); else localStorage.removeItem(LOBBY + code); },
    async remove(code) { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(PRE + code + "/")) localStorage.removeItem(k); } done(); }
  };
}
