import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openStore } from "../src/storage/store.js";
import { loadProgress, record } from "../src/storage/progress-service.js";
import { syncAccount, pushGalley, forgetAccount, clearAccount, ensurePpBoard } from "../src/storage/account-sync.js";
import W1K from "../src/data/words-1k.js";

// An in-memory stand-in for Firestore that behaves like the rules: results can't be overwritten.
function fakeCloud() {
  const accounts = new Map(), results = new Map();
  const bucket = (uid) => { if (!results.has(uid)) results.set(uid, new Map()); return results.get(uid); };
  return {
    accounts, results, offline: false, writes: 0,
    async getAccount(uid) { return structuredClone(accounts.get(uid) ?? null); },
    async foldAccount(uid, fn) {
      if (this.offline) throw new Error("offline");
      const next = fn(structuredClone(accounts.get(uid) ?? null));
      accounts.set(uid, structuredClone(next)); this.writes++;
      return structuredClone(next);
    },
    async putResult(uid, r) {
      if (this.offline) throw new Error("offline");
      if (typeof r.keys !== "string") throw new Error("keys must be a string");
      if (r.userId !== uid) throw new Error("wrong owner");
      if (!bucket(uid).has(r.id)) bucket(uid).set(r.id, structuredClone(r));
    },
    async recentResults(uid, n) { return [...bucket(uid).values()].sort((a, b) => b.at - a.at).slice(0, n).map((r) => structuredClone(r)); },
    async deleteAll(uid) { accounts.delete(uid); results.delete(uid); }
  };
}

let seq = 0;
const galley = (extra = {}) => ({
  id: `r${++seq}`, at: 1763300000000 + seq * 1000, day: "2026-11-16", kind: "normal", mode: "words", length: 25, list: "200",
  wordsDone: 25, wpm: 60, acc: 98, score: 57.6, secs: 20, keyCount: 120, clean: false, keys: [[0, 0, "t", 1, 0, 0]], targets: ["the"], ...extra
});
const words = [{ word: "order", errs: 1, occ: 1, slow: 0 }];
const TODAY = "2026-11-16";

async function device() {
  const store = await openStore(new IDBFactory());
  return { store, state: await loadProgress(store) };
}
async function play(d, extra) {
  const r = galley(extra);
  d.state = (await record(d.store, d.state, r, words)).state;
  return r;
}

describe("signing in", () => {
  beforeEach(() => { seq = 0; });

  it("brings a guest's galleys into a new account", async () => {
    const cloud = fakeCloud(), d = await device();
    await play(d); await play(d, { score: 70, wpm: 70, acc: 100 });
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    expect(cloud.accounts.get("ana").totals.galleys).toBe(2);
    expect(cloud.results.get("ana").size).toBe(2);
    expect([...cloud.results.get("ana").values()].every((r) => r.userId === "ana")).toBe(true);
    expect(d.state.totals.galleys).toBe(2);
    expect(d.state.recent.every((r) => r.userId === "ana")).toBe(true);
    expect(await d.store.get("account")).toBe("ana");
    expect(await d.store.get("pending")).toEqual([]);
  });

  it("adds a second device's guest galleys to an existing account and shows both", async () => {
    const cloud = fakeCloud(), a = await device(), b = await device();
    await play(a); await play(a);
    a.state = await syncAccount({ store: a.store, cloud, uid: "ana", state: a.state, today: TODAY });
    await play(b);
    b.state = await syncAccount({ store: b.store, cloud, uid: "ana", state: b.state, today: TODAY });
    expect(b.state.totals.galleys).toBe(3);
    expect(b.state.recent).toHaveLength(3);
    expect(cloud.accounts.get("ana").totals.galleys).toBe(3);
  });

  it("doesn't count anything twice when it syncs again", async () => {
    const cloud = fakeCloud(), d = await device();
    await play(d);
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    expect(cloud.accounts.get("ana").totals.galleys).toBe(1);
  });
});

describe("finishing galleys while signed in", () => {
  beforeEach(() => { seq = 0; });

  it("uploads each galley and keeps totals right", async () => {
    const cloud = fakeCloud(), d = await device();
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    for (let i = 0; i < 3; i++) {
      const r = await play(d);
      d.state = (await pushGalley({ store: d.store, cloud, uid: "ana", state: d.state, result: r, words, today: TODAY })) || d.state;
    }
    expect(cloud.accounts.get("ana").totals.galleys).toBe(3);
    expect(cloud.accounts.get("ana").weak.order).toBeTruthy();
    expect(await d.store.get("pending")).toEqual([]);
  });

  it("keeps galleys finished offline and sends them at the next sync", async () => {
    const cloud = fakeCloud(), d = await device();
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    cloud.offline = true;
    const r = await play(d);
    expect(await pushGalley({ store: d.store, cloud, uid: "ana", state: d.state, result: r, words, today: TODAY })).toBeNull();
    expect(await d.store.get("pending")).toEqual([r.id]);
    cloud.offline = false;
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    expect(cloud.accounts.get("ana").totals.galleys).toBe(1);
    expect(await d.store.get("pending")).toEqual([]);
  });

  it("two devices at once both count", async () => {
    const cloud = fakeCloud(), a = await device(), b = await device();
    a.state = await syncAccount({ store: a.store, cloud, uid: "ana", state: a.state, today: TODAY });
    b.state = await syncAccount({ store: b.store, cloud, uid: "ana", state: b.state, today: TODAY });
    const ra = await play(a), rb = await play(b);
    await Promise.all([
      pushGalley({ store: a.store, cloud, uid: "ana", state: a.state, result: ra, words, today: TODAY }),
      pushGalley({ store: b.store, cloud, uid: "ana", state: b.state, result: rb, words, today: TODAY })
    ]);
    expect(cloud.accounts.get("ana").totals.galleys).toBe(2);
  });

  it("adds the same XP to the account as to this browser", async () => {
    const cloud = fakeCloud(), d = await device();
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    for (let i = 0; i < 3; i++) {
      const r = await play(d, { clean: true });
      expect(r.xp).toBeGreaterThan(0);
      d.state = (await pushGalley({ store: d.store, cloud, uid: "ana", state: d.state, result: r, words, today: TODAY })) || d.state;
    }
    expect(cloud.accounts.get("ana").xp).toBe(d.state.xp);
    expect(d.state.xp).toBeGreaterThan(0);
  });

  it("keeps the same top galleys and PP in the account as in this browser", async () => {
    const cloud = fakeCloud(), d = await device();
    const pp = (i) => ({ targets: W1K.slice(i * 30, i * 30 + 26), wpm: 60 + i * 10, acc: 100 });
    await play(d, pp(0)); // as a guest, before signing in
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    expect(cloud.accounts.get("ana").top).toHaveLength(1);
    for (let i = 1; i < 4; i++) {
      const r = await play(d, pp(i));
      expect(r.pp).toBeGreaterThan(0);
      d.state = (await pushGalley({ store: d.store, cloud, uid: "ana", state: d.state, result: r, words, today: TODAY })) || d.state;
    }
    expect(cloud.accounts.get("ana").top).toEqual(d.state.top);
    expect(d.state.top.map((p) => p.wpm)).toEqual([90, 80, 70, 60]);
    // a second browser signing in sees the same
    const d2 = await device();
    d2.state = await syncAccount({ store: d2.store, cloud, uid: "ana", state: d2.state, today: TODAY });
    expect(d2.state.top).toEqual(d.state.top);
  });

  it("asks the server to score older galleys for the PP board once", async () => {
    let calls = 0, entry = null;
    const cloud = { async ppEntry() { return entry; }, async backfillPp() { calls++; entry = { backfilled: true }; } };
    expect(await ensurePpBoard({ cloud, uid: "ana", state: { top: [] } })).toBe(false);
    expect(await ensurePpBoard({ cloud, uid: "ana", state: { top: [{ id: "a", pp: 5 }] } })).toBe(true);
    expect(await ensurePpBoard({ cloud, uid: "ana", state: { top: [{ id: "a", pp: 5 }] } })).toBe(false);
    expect(calls).toBe(1);
  });

  it("does nothing for a guest", async () => {
    const cloud = fakeCloud(), d = await device();
    const r = await play(d);
    expect(await pushGalley({ store: d.store, cloud, uid: null, state: d.state, result: r, words, today: TODAY })).toBeNull();
    expect(await d.store.get("pending")).toBeUndefined();
    expect(cloud.writes).toBe(0);
  });
});

describe("signing out and clearing", () => {
  beforeEach(() => { seq = 0; });

  it("signing out leaves the account intact and this browser empty", async () => {
    const cloud = fakeCloud(), d = await device();
    await play(d);
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    await forgetAccount(d.store);
    expect(await d.store.count()).toBe(0);
    expect(await d.store.get("account")).toBeUndefined();
    expect(cloud.accounts.get("ana").totals.galleys).toBe(1);
  });

  it("someone else signing in afterwards gets none of the previous account's galleys", async () => {
    const cloud = fakeCloud(), d = await device();
    await play(d);
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    await forgetAccount(d.store);
    d.state = await loadProgress(d.store);
    d.state = await syncAccount({ store: d.store, cloud, uid: "ben", state: d.state, today: TODAY });
    expect(cloud.accounts.get("ben").totals.galleys).toBe(0);
    expect(cloud.results.get("ben")?.size || 0).toBe(0);
  });

  it("clearing progress while signed in removes it from the account too", async () => {
    const cloud = fakeCloud(), d = await device();
    await play(d);
    d.state = await syncAccount({ store: d.store, cloud, uid: "ana", state: d.state, today: TODAY });
    await clearAccount({ store: d.store, cloud, uid: "ana" });
    expect(cloud.accounts.has("ana")).toBe(false);
    expect(await d.store.count()).toBe(0);
    expect(await d.store.get("account")).toBe("ana");
  });
});
