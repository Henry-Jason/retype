// Friend rooms on the Firebase Realtime Database: low-latency, and it can mark a player gone when
// their connection drops. Loaded only when someone opens a room. The data's shape and the race
// rules are in core/room.js; database.rules.json says who may write what.
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp, query, orderByChild, limitToLast } from "firebase/database";
import { ROOM } from "../core/room.js";

export function createRooms(app, { emulators = false } = {}) {
  const db = getDatabase(app);
  if (emulators) connectDatabaseEmulator(db, "127.0.0.1", 9000);
  let offset = 0;
  onValue(ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
  const at = (code, path = "") => ref(db, `rooms/${code}${path ? "/" + path : ""}`);
  let presence = null; // { code, uid, stop }: this tab is in at most one room

  function stay(code, uid) {
    presence?.stop();
    const me = at(code, `players/${uid}`);
    // whenever the connection (re)opens: say we're here, and that we're gone if it drops
    const stop = onValue(ref(db, ".info/connected"), async (s) => {
      if (!s.val()) return;
      await onDisconnect(me).update({ online: false });
      await update(me, { online: true });
    });
    presence = { code, uid, stop };
  }

  return {
    serverNow: () => Date.now() + offset,
    async create(code, { uid, name, settings, open = false }) {
      // a multi-path update, not a set: the rules grant each field on its own, never the room as a
      // whole. They refuse it if the code is already someone's room. A public room goes in the lobby too.
      const r = `rooms/${code}/`;
      try {
        await update(ref(db), {
          [r + "host"]: uid, [r + "created"]: serverTimestamp(), [r + "settings"]: settings, [r + "round"]: 0, [r + "state"]: "lobby", [r + "public"]: open,
          [r + `players/${uid}`]: { name, joined: serverTimestamp(), online: true },
          ...(open ? { [`lobby/${code}`]: { mode: settings.mode, n: 1, state: "lobby", at: serverTimestamp() } } : {})
        });
      } catch { return { error: "taken" }; }
      stay(code, uid);
      return { ok: true };
    },
    async join(code, { uid, name }) {
      const s = await get(at(code));
      if (!s.exists()) return { error: "There's no room with that code." };
      const room = s.val(), players = room.players || {};
      if (!players[uid] && Object.values(players).filter((p) => p.online).length >= ROOM.maxPlayers) return { error: `That room is full (${ROOM.maxPlayers} players).` };
      await set(at(code, `players/${uid}`), { name, joined: players[uid]?.joined ?? serverTimestamp(), online: true });
      stay(code, uid);
      return { ok: true };
    },
    watch(code, cb) {
      return onValue(at(code), (s) => cb(s.exists() ? s.val() : null), () => cb(null));
    },
    async leave(code, uid) {
      if (presence?.code === code) { presence.stop(); presence = null; }
      await onDisconnect(at(code, `players/${uid}`)).cancel().catch(() => {});
      await update(at(code, `players/${uid}`), { online: false }).catch(() => {});
    },
    /** Host only: settings, state, round, seed, startAt, entrants, host. */
    update: (code, patch) => update(at(code), patch),
    report: (code, round, uid, run) => set(at(code, `runs/${round}/${uid}`), run),
    remove: (code) => remove(at(code)),
    /** Public rooms open for quick races: { code: { mode, n, state, at } }. */
    async lobby() {
      const s = await get(query(ref(db, "lobby"), orderByChild("at"), limitToLast(50)));
      return s.exists() ? s.val() : {};
    },
    /** Host only: keep this room's lobby entry current, or take it out (null). */
    list: (code, entry) => set(ref(db, `lobby/${code}`), entry ? { ...entry, at: serverTimestamp() } : null)
  };
}
