import { totalPp } from "../../src/core/pp.js";
import { screenQuote, submission, sharedId, existingVerdict, review, report } from "../../src/core/moderation.js";
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
