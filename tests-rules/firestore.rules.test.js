// Security rules, run against the Firestore emulator: npm run test:rules
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

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
    await assertSucceeds(setDoc(doc(as("ana"), "users/ana"), { ...account(), xp: 1234 }));
    await assertFails(setDoc(doc(as("ana"), "users/ana"), { ...account(), xp: -5 }));
    const play = (i) => ({ id: `r${i}`, pp: 50, at: i, wpm: 80, acc: 99, kind: "normal", mode: "words", length: 50, list: "1k" });
    await assertSucceeds(setDoc(doc(as("ana"), "users/ana"), { ...account(), top: Array.from({ length: 100 }, (_, i) => play(i)) }));
    await assertFails(setDoc(doc(as("ana"), "users/ana"), { ...account(), top: Array.from({ length: 101 }, (_, i) => play(i)) }));
    await assertFails(setDoc(doc(as("ana"), "users/ana"), { ...account(), top: "lots" }));
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

describe("profiles", () => {
  it("are public to read and yours alone to write", async () => {
    await assertSucceeds(setDoc(doc(as("ana"), "profiles/ana"), { name: "Ana" }));
    await assertSucceeds(getDoc(doc(anon(), "profiles/ana")));
    await assertFails(setDoc(doc(as("ben"), "profiles/ana"), { name: "Ben" }));
  });
  it("hold only a sensible name", async () => {
    await assertFails(setDoc(doc(as("ana"), "profiles/ana"), { name: "A" }));
    await assertFails(setDoc(doc(as("ana"), "profiles/ana"), { name: "x".repeat(21) }));
    await assertFails(setDoc(doc(as("ana"), "profiles/ana"), { name: "Ana", admin: true }));
  });
});

describe("leaderboards", () => {
  it("anyone can read, no browser can write", async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "boards/daily-2026-11-16/entries/ana"), { score: 80 }));
    await assertSucceeds(getDoc(doc(anon(), "boards/daily-2026-11-16/entries/ana")));
    await assertFails(setDoc(doc(as("ana"), "boards/daily-2026-11-16/entries/ana"), { score: 300 }));
    await assertFails(updateDoc(doc(as("ana"), "boards/daily-2026-11-16/entries/ana"), { score: 300 }));
    await assertFails(deleteDoc(doc(as("ana"), "boards/daily-2026-11-16/entries/ana")));
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "boards/pp/entries/ana"), { pp: 812 }));
    await assertSucceeds(getDoc(doc(anon(), "boards/pp/entries/ana")));
    await assertFails(setDoc(doc(as("ana"), "boards/pp/entries/ana"), { pp: 99999 }));
  });
});

describe("shared quotes", () => {
  const q = (id, uid, status) => ({ id, text: "a shared quote here", source: "Somewhere", by: "", uid, name: "Ana", status, flags: [], reports: 0, at: 1 });
  const seed = (id, data) => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "quotes/" + id), data));
  it("anyone can read approved ones and list them", async () => {
    await seed("s1", q("s1", "ana", "approved"));
    await assertSucceeds(getDoc(doc(anon(), "quotes/s1")));
    await assertSucceeds(getDocs(query(collection(anon(), "quotes"), where("status", "==", "approved"))));
  });
  it("only the submitter and admins see the rest", async () => {
    await seed("s2", q("s2", "ana", "pending"));
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "admins/root"), { at: 1 }));
    await assertSucceeds(getDoc(doc(as("ana"), "quotes/s2")));
    await assertSucceeds(getDocs(query(collection(as("ana"), "quotes"), where("uid", "==", "ana"))));
    await assertSucceeds(getDoc(doc(as("root"), "quotes/s2")));
    await assertSucceeds(getDocs(query(collection(as("root"), "quotes"), where("status", "==", "pending"))));
    await assertFails(getDoc(doc(as("ben"), "quotes/s2")));
    await assertFails(getDoc(doc(anon(), "quotes/s2")));
    await assertFails(getDocs(query(collection(as("ben"), "quotes"), where("status", "==", "pending"))));
  });
  it("no browser can write a quote, a report or an admin", async () => {
    await seed("s3", q("s3", "ana", "pending"));
    await assertFails(setDoc(doc(as("ana"), "quotes/s4"), q("s4", "ana", "approved")));
    await assertFails(updateDoc(doc(as("ana"), "quotes/s3"), { status: "approved" }));
    await assertFails(deleteDoc(doc(as("ana"), "quotes/s3")));
    await assertFails(setDoc(doc(as("ben"), "quotes/s3/reports/ben"), { reason: "spam" }));
    await assertFails(setDoc(doc(as("ana"), "admins/ana"), { at: 1 }));
  });
  it("you can see whether you're an admin, but not who else is", async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "admins/root"), { at: 1 }));
    await assertSucceeds(getDoc(doc(as("root"), "admins/root")));
    await assertSucceeds(getDoc(doc(as("ana"), "admins/ana")));
    await assertFails(getDoc(doc(as("ana"), "admins/root")));
  });
});

describe("everything else", () => {
  it("is closed", async () => {
    await assertFails(setDoc(doc(as("ana"), "leaderboard/x"), { wpm: 300 }));
    await assertFails(getDoc(doc(as("ana"), "leaderboard/x")));
  });
});
