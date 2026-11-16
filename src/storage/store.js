// Local storage for a guest: every finished galley plus a few small records (profile, bests,
// weak-word profile, streak days). IndexedDB when available, memory otherwise (private windows
// in some browsers), so the app always works even if nothing can be saved.
//
// The shapes are the ones an account will sync later: results keyed by id with a userId,
// and the profile holding the guest id that an account would take over.

const DB = "retype", VERSION = 1;

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function openStore(idb = globalThis.indexedDB) {
  if (!idb) return memoryStore();
  try {
    const open = idb.open(DB, VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("results")) {
        const s = db.createObjectStore("results", { keyPath: "id" });
        s.createIndex("at", "at");
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    const db = await req(open);
    return idbStore(db);
  } catch {
    return memoryStore();
  }
}

function idbStore(db) {
  const tx = (name, mode) => db.transaction(name, mode).objectStore(name);
  return {
    persistent: true,
    async addResult(r) { await req(tx("results", "readwrite").put(r)); },
    /** Newest first. */
    async recent(limit = 50) {
      const out = [];
      await new Promise((res, rej) => {
        const c = tx("results", "readonly").index("at").openCursor(null, "prev");
        c.onsuccess = () => {
          const cur = c.result;
          if (!cur || out.length >= limit) return res();
          out.push(cur.value); cur.continue();
        };
        c.onerror = () => rej(c.error);
      });
      return out;
    },
    async count() { return req(tx("results", "readonly").count()); },
    async all() { return req(tx("results", "readonly").getAll()); },
    async getResult(id) { return req(tx("results", "readonly").get(id)); },
    async get(key) { return req(tx("meta", "readonly").get(key)); },
    async set(key, value) { await req(tx("meta", "readwrite").put(value, key)); },
    async clear() {
      await req(tx("results", "readwrite").clear());
      await req(tx("meta", "readwrite").clear());
    }
  };
}

export function memoryStore() {
  const results = new Map(), meta = new Map();
  return {
    persistent: false,
    async addResult(r) { results.set(r.id, structuredClone(r)); },
    async recent(limit = 50) { return [...results.values()].sort((a, b) => b.at - a.at).slice(0, limit); },
    async count() { return results.size; },
    async all() { return [...results.values()].map((r) => structuredClone(r)); },
    async getResult(id) { return results.has(id) ? structuredClone(results.get(id)) : undefined; },
    async get(key) { return meta.has(key) ? structuredClone(meta.get(key)) : undefined; },
    async set(key, value) { meta.set(key, structuredClone(value)); },
    async clear() { results.clear(); meta.clear(); }
  };
}
