// Cloud Functions for Retype. Deployed with `firebase deploy --only functions`; the shared
// scoring code is copied into ./shared by scripts/sync-functions.mjs before each deploy.
import { onDocumentCreated, onDocumentWritten, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { boardEntry, DAY_MS } from "./board.js";
import { ppPlay, nextEntry } from "./pp.js";

initializeApp();
// europe-west1 sits beside the eur3 Firestore database; the cap keeps a runaway from costing money
setGlobalOptions({ region: "europe-west1", maxInstances: 5 });
const db = getFirestore();

/**
 * When a daily galley is saved to someone's account, check it from its keystrokes and, if it
 * holds up, put it on that day's board. Only the first attempt of the day counts. The board
 * can only be written from here: the security rules close it to every browser.
 */
export const postDaily = onDocumentCreated("users/{uid}/results/{rid}", async (event) => {
  const result = event.data?.data();
  if (!result || result.kind !== "daily") return;
  const { uid, rid } = event.params;
  const profile = await db.doc(`profiles/${uid}`).get();
  const out = boardEntry({ uid, rid, result, name: profile.exists ? profile.data().name : null, now: Date.now() });
  if (!out.ok) { logger.info("daily not posted", { uid, rid, reason: out.reason }); return; }
  const ref = db.doc(`boards/daily-${result.day}/entries/${uid}`);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists && cur.data().at <= result.at) return; // an earlier attempt already counts
    tx.set(ref, out.entry);
  });
});

const nameOf = async (uid) => {
  const p = await db.doc(`profiles/${uid}`).get();
  return p.exists ? p.data().name : null;
};
const ppRef = (uid) => db.doc(`boards/pp/entries/${uid}`);

/**
 * Every saved galley that earns PP is re-scored from its keystrokes here and added to the
 * person's entry on the all-time PP board (their top 100 plays and the weighted total).
 */
export const postPp = onDocumentCreated("users/{uid}/results/{rid}", async (event) => {
  const result = event.data?.data();
  if (!result) return;
  const { uid, rid } = event.params;
  const out = ppPlay({ uid, rid, result, now: Date.now() });
  if (!out.ok) { if (!out.quiet) logger.info("galley not counted for PP", { uid, rid, reason: out.reason }); return; }
  const name = await nameOf(uid);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ppRef(uid));
    tx.set(ppRef(uid), nextEntry({ uid, cur: cur.exists ? cur.data() : null, plays: [out.play], name, now: Date.now() }));
  });
});

/**
 * Once per account: score every galley it already holds (typed before PP existed). Called by
 * the app when someone's board entry is missing or hasn't been backfilled yet.
 */
export const backfillPp = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const cur = await ppRef(uid).get();
  if (cur.exists && cur.data().backfilled) return { pp: cur.data().pp, count: cur.data().count, already: true };
  const snap = await db.collection(`users/${uid}/results`).orderBy("at", "desc").limit(1000).get();
  const now = Date.now(), plays = [];
  for (const d of snap.docs) {
    const out = ppPlay({ uid, rid: d.id, result: d.data(), now });
    if (out.ok) plays.push(out.play);
  }
  const name = await nameOf(uid);
  const entry = await db.runTransaction(async (tx) => {
    const c = await tx.get(ppRef(uid));
    const e = nextEntry({ uid, cur: c.exists ? c.data() : null, plays, name, now, backfilled: true });
    tx.set(ppRef(uid), e);
    return e;
  });
  return { pp: entry.pp, count: entry.count, already: false };
});

/** Clearing progress deletes the account document; the board entry goes with it. */
export const clearPp = onDocumentDeleted("users/{uid}", async (event) => {
  await ppRef(event.params.uid).delete();
});

/** A changed display name follows onto the PP board and the last two days' daily boards. */
export const renameOnBoards = onDocumentWritten("profiles/{uid}", async (event) => {
  const name = event.data?.after?.data()?.name;
  if (!name) return;
  const { uid } = event.params;
  const days = [0, 1].map((n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10));
  const refs = [ppRef(uid), ...days.map((day) => db.doc(`boards/daily-${day}/entries/${uid}`))];
  await Promise.all(refs.map(async (ref) => {
    const snap = await ref.get();
    if (snap.exists && snap.data().name !== name) await ref.update({ name });
  }));
});
