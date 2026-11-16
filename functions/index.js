// Cloud Functions for Retype. Deployed with `firebase deploy --only functions`; the shared
// scoring code is copied into ./shared by scripts/sync-functions.mjs before each deploy.
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { boardEntry, DAY_MS } from "./board.js";

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

/** A changed display name follows onto the last two days' boards. */
export const renameOnBoards = onDocumentWritten("profiles/{uid}", async (event) => {
  const name = event.data?.after?.data()?.name;
  if (!name) return;
  const { uid } = event.params;
  const days = [0, 1].map((n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10));
  await Promise.all(days.map(async (day) => {
    const ref = db.doc(`boards/daily-${day}/entries/${uid}`);
    const snap = await ref.get();
    if (snap.exists && snap.data().name !== name) await ref.update({ name });
  }));
});
