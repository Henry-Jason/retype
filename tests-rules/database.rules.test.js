// Friend-room rules, run against the Realtime Database emulator: npm run test:rules
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, get, set, update, remove, serverTimestamp } from "firebase/database";

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "retype-rules-test",
    database: { rules: readFileSync("database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 }
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearDatabase(); });

const db = (uid) => env.authenticatedContext(uid).database();
const anon = () => env.unauthenticatedContext().database();
const settings = { mode: "words", length: 25, list: "200", punct: false, nums: false };
// made the way the app makes one: an update of each field (the rules never grant the room as a whole)
const newRoom = (uid) => ({ host: uid, created: serverTimestamp(), settings, round: 0, state: "lobby", [`players/${uid}`]: { name: "Ana", joined: serverTimestamp(), online: true } });
const me = (name = "Ben") => ({ name, joined: serverTimestamp(), online: true });
const run = (extra = {}) => ({ c: 10, w: 2, wpm: 60, acc: 98, done: false, at: 1, ...extra });
async function made() {
  await assertSucceeds(update(ref(db("ana"), "rooms/KXQ7P"), newRoom("ana")));
  await assertSucceeds(set(ref(db("ben"), "rooms/KXQ7P/players/ben"), me()));
}

describe("rooms", () => {
  it("lets a signed-in player make a room and others join it", async () => {
    await made();
    await assertSucceeds(get(ref(db("ben"), "rooms/KXQ7P")));
    await assertFails(get(ref(anon(), "rooms/KXQ7P")));
  });
  it("refuses taking over a code that's in use, and bad codes", async () => {
    await made();
    await assertFails(update(ref(db("cat"), "rooms/KXQ7P"), newRoom("cat")));
    await assertFails(update(ref(db("cat"), "rooms/KXQ0O"), newRoom("cat")));
    await assertFails(update(ref(db("cat"), "rooms/ABCDE"), { ...newRoom("cat"), host: "ana" }));
  });
  it("lets only the host start races and change settings", async () => {
    await made();
    await assertSucceeds(update(ref(db("ana"), "rooms/KXQ7P"), { round: 1, seed: 42, startAt: Date.now() + 4000, state: "race", entrants: { ana: true, ben: true } }));
    await assertFails(update(ref(db("ben"), "rooms/KXQ7P"), { state: "done" }));
    await assertFails(set(ref(db("ben"), "rooms/KXQ7P/settings"), { ...settings, length: 50 }));
    await assertFails(update(ref(db("ana"), "rooms/KXQ7P"), { round: 0 })); // rounds only go up
    await assertFails(set(ref(db("ana"), "rooms/KXQ7P/settings"), { ...settings, mode: "survival" }));
  });
  it("lets you write only your own player entry and runs, in the current round", async () => {
    await made();
    await assertSucceeds(update(ref(db("ana"), "rooms/KXQ7P"), { round: 1, state: "race" }));
    await assertSucceeds(set(ref(db("ben"), "rooms/KXQ7P/runs/1/ben"), run()));
    await assertFails(set(ref(db("ben"), "rooms/KXQ7P/runs/1/ana"), run()));
    await assertFails(set(ref(db("ben"), "rooms/KXQ7P/runs/2/ben"), run()));
    await assertFails(set(ref(db("ben"), "rooms/KXQ7P/runs/1/ben"), run({ wpm: "fast" })));
    await assertFails(update(ref(db("ben"), "rooms/KXQ7P/players/ana"), { online: false }));
    await assertSucceeds(update(ref(db("ben"), "rooms/KXQ7P/players/ben"), { online: false }));
    await assertFails(set(ref(db("cat"), "rooms/NOPE2/players/cat"), me("Cat"))); // no such room
  });
  it("lets a player take over from a host who has gone, but not from one who's here", async () => {
    await made();
    await assertFails(set(ref(db("ben"), "rooms/KXQ7P/host"), "ben"));
    await assertSucceeds(update(ref(db("ana"), "rooms/KXQ7P/players/ana"), { online: false }));
    await assertSucceeds(set(ref(db("ben"), "rooms/KXQ7P/host"), "ben"));
    await assertFails(set(ref(db("cat"), "rooms/KXQ7P/host"), "cat")); // not in the room
  });
  it("never grants writing a whole room in one go", async () => {
    await assertFails(set(ref(db("ana"), "rooms/KXQ7P"), { host: "ana", created: serverTimestamp(), settings, round: 0, state: "lobby" }));
  });
  it("lets only the host take the room down", async () => {
    await made();
    await assertFails(remove(ref(db("ben"), "rooms/KXQ7P")));
    await assertSucceeds(remove(ref(db("ana"), "rooms/KXQ7P")));
  });
});
