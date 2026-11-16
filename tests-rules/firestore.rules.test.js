// Security rules, run against the Firestore emulator: npm run test:rules
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "retype-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const account = () => ({ v: 1, bests: {}, weak: {}, days: ["2026-11-16"], bestStreak: 1, totals: { galleys: 1, secs: 20, keys: 100, perfect: 0 } });
const result = (id, uid, extra = {}) => ({
  id, userId: uid, at: 1763300000000, day: "2026-11-16", kind: "normal", mode: "words",
  wpm: 61.5, acc: 97.3, score: 58.2, keys: "[[0,0,\"t\",1,0,0]]", targets: ["the", "cat"], ...extra
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("account documents", () => {
  it("lets you write and read your own", async () => {
    await assertSucceeds(setDoc(doc(as("ana"), "users/ana"), account()));
    await assertSucceeds(getDoc(doc(as("ana"), "users/ana")));
    await assertSucceeds(updateDoc(doc(as("ana"), "users/ana"), { bestStreak: 2 }));
  });
  it("keeps other people out", async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "users/ana"), account()));
    await assertFails(getDoc(doc(as("ben"), "users/ana")));
    await assertFails(setDoc(doc(as("ben"), "users/ana"), account()));
    await assertFails(deleteDoc(doc(as("ben"), "users/ana")));
    await assertFails(getDoc(doc(anon(), "users/ana")));
  });
  it("refuses unknown fields and wrong types", async () => {
    await assertFails(setDoc(doc(as("ana"), "users/ana"), { ...account(), admin: true }));
    await assertFails(setDoc(doc(as("ana"), "users/ana"), { ...account(), days: "today" }));
    await assertFails(setDoc(doc(as("ana"), "users/ana"), { ...account(), name: "x".repeat(41) }));
    await assertFails(setDoc(doc(as("ana"), "users/ana"), { ...account(), folded: Array(301).fill("r") }));
    await assertSucceeds(setDoc(doc(as("ana"), "users/ana"), { ...account(), folded: ["r1"] }));
    await assertSucceeds(setDoc(doc(as("ana"), "users/ana"), { ...account(), name: "Ana" }));
  });
});

describe("galley results", () => {
  it("lets you add your own and read them back", async () => {
    await assertSucceeds(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ana")));
    await assertSucceeds(getDoc(doc(as("ana"), "users/ana/results/r1")));
  });
  it("never lets a result be changed after it's written", async () => {
    await assertSucceeds(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ana")));
    await assertFails(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ana", { wpm: 200 })));
    await assertFails(updateDoc(doc(as("ana"), "users/ana/results/r1"), { acc: 100 }));
  });
  it("lets you delete your own (clearing progress)", async () => {
    await assertSucceeds(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ana")));
    await assertSucceeds(deleteDoc(doc(as("ana"), "users/ana/results/r1")));
  });
  it("refuses results filed under someone else, or with a mismatched id", async () => {
    await assertFails(setDoc(doc(as("ben"), "users/ana/results/r1"), result("r1", "ana")));
    await assertFails(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ben")));
    await assertFails(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r2", "ana")));
  });
  it("refuses impossible numbers and the wrong shapes", async () => {
    await assertFails(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ana", { acc: 140 })));
    await assertFails(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ana", { wpm: -5 })));
    await assertFails(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ana", { kind: "admin" })));
    await assertFails(setDoc(doc(as("ana"), "users/ana/results/r1"), result("r1", "ana", { keys: [1, 2] })));
  });
});

describe("everything else", () => {
  it("is closed", async () => {
    await assertFails(setDoc(doc(as("ana"), "leaderboard/x"), { wpm: 300 }));
    await assertFails(getDoc(doc(as("ana"), "leaderboard/x")));
  });
});
