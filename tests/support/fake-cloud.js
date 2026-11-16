import { totalPp } from "../../src/core/pp.js";
// An in-memory stand-in for Firebase, used by `vite build --mode uitest` to check the
// account interface in a browser. Never part of a normal build.
export function createFakeCloud() {
  const KEY = "retype-fake-cloud";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { accounts: {}, results: {}, user: null }; } catch { return { accounts: {}, results: {}, user: null }; } };
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  let listener = null;
  const me = { uid: "test-uid", name: "Henry Test", email: "henry@example.com", photo: "" };
  return {
    onUser(cb) { listener = cb; setTimeout(() => cb(load().user), 0); return () => {}; },
    async signIn() { const d = load(); d.user = me; save(d); listener?.(me); },
    async signOut() { const d = load(); d.user = null; save(d); listener?.(null); },
    async getAccount(uid) { return load().accounts[uid] ?? null; },
    async foldAccount(uid, fn) { const d = load(); const next = fn(d.accounts[uid] ?? null); d.accounts[uid] = next; save(d); return next; },
    async putResult(uid, r) { const d = load(); d.results[uid] ??= {}; d.results[uid][r.id] ??= r; save(d); },
    async recentResults(uid, n) { return Object.values(load().results[uid] || {}).sort((a, b) => b.at - a.at).slice(0, n); },
    async getProfile(uid) { return (load().profiles || {})[uid] ?? null; },
    async setProfile(uid, name) { const d = load(); d.profiles ??= {}; d.profiles[uid] = { name }; save(d); },
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
    async ppEntry(uid) { return (await this.ppBoard()).find((r) => r.uid === uid) || null; },
    async ppPlace(pp) { const b = await this.ppBoard(); return { place: b.filter((r) => r.pp > pp).length + 1, of: b.length }; },
    async backfillPp() { const d = load(); d.backfilled = (d.backfilled || 0) + 1; save(d); return { already: false }; },
    async deleteAll(uid) { const d = load(); delete d.accounts[uid]; delete d.results[uid]; save(d); }
  };
}
