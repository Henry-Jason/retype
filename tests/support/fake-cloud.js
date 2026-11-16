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
    async deleteAll(uid) { const d = load(); delete d.accounts[uid]; delete d.results[uid]; save(d); }
  };
}
