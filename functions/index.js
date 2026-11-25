// Cloud Functions for Retype. Deployed with `firebase deploy --only functions`; the shared
// scoring code is copied into ./shared by scripts/sync-functions.mjs before each deploy.
import { onDocumentCreated, onDocumentWritten, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from "firebase-admin/database";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { boardEntry, survivalEntry, DAY_MS } from "./board.js";
import { ppPlay, nextEntry } from "./pp.js";
import { screenQuote, submission, existingVerdict, countToday, review, report, sharedId, SHARE_RULES, limitsFor, screenName, safeName, fallbackName } from "./shared/core/moderation.js";
import { onValueWritten } from "firebase-functions/v2/database";
import { poolEntry } from "./shared/core/racers.js";
import { verifyForBoard } from "./shared/core/verify.js";

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
  const out = boardEntry({ uid, rid, result, name: profile.exists ? safeName(profile.data().name, uid) : null, now: Date.now() });
  if (!out.ok) { logger.info("daily not posted", { uid, rid, reason: out.reason }); return; }
  const ref = db.doc(`boards/daily-${result.day}/entries/${uid}`);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists && cur.data().at <= result.at) return; // an earlier attempt already counts
    tx.set(ref, out.entry);
  });
});

/** The same for the daily survival run, on its own board. */
export const postDailySurvival = onDocumentCreated("users/{uid}/results/{rid}", async (event) => {
  const result = event.data?.data();
  if (!result || result.kind !== "dsurv") return;
  const { uid, rid } = event.params;
  const profile = await db.doc(`profiles/${uid}`).get();
  const out = survivalEntry({ uid, rid, result, name: profile.exists ? safeName(profile.data().name, uid) : null, now: Date.now() });
  if (!out.ok) { logger.info("daily survival not posted", { uid, rid, reason: out.reason }); return; }
  const ref = db.doc(`boards/dsurv-${result.day}/entries/${uid}`);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists && cur.data().at <= result.at) return; // an earlier attempt already counts
    tx.set(ref, out.entry);
  });
});

// every name copied anywhere public goes through safeName, in case an old profile predates the check
const nameOf = async (uid) => {
  const p = await db.doc(`profiles/${uid}`).get();
  return p.exists ? safeName(p.data().name, uid) : null;
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

/** Clearing progress deletes the account document; the board entry and any ghosts go with it. */
export const clearPp = onDocumentDeleted("users/{uid}", async (event) => {
  const uid = event.params.uid;
  await ppRef(uid).delete();
  await Promise.all(["words", "time", "quote", "survival"].map((m) => db.doc(`ghosts/${m}/runs/${uid}`).delete()));
});

/**
 * Ghosts for quick races: a finished galley of a quick-race kind (25 words, 30 seconds, a short
 * quote or standard survival), checked from its keystrokes, becomes that player's ghost of that
 * kind (their latest replaces the one before). Players can opt out in Settings ("lend: false").
 */
export const collectGhost = onDocumentCreated("users/{uid}/results/{rid}", async (event) => {
  const result = event.data?.data();
  if (!result) return;
  const { uid, rid } = event.params;
  if (result.userId !== uid || result.id !== rid) return;
  const v = verifyForBoard(result);
  if (!v.ok) return;
  const e = poolEntry({ uid, result, name: await nameOf(uid), wpm: v.wpm, acc: v.acc, now: Date.now() });
  if (e) await db.doc(`ghosts/${e.mode}/runs/${uid}`).set(e.doc);
});

/**
 * Display names are set only through here, so the name filter's word lists stay on the server.
 * { name, fallback }: with fallback, a name that fails becomes "Typist ABCD" instead of an error
 * (used for the first name, taken from the Google account).
 */
export const setName = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const r = screenName(req.data?.name);
  if (!r.ok && !req.data?.fallback) throw new HttpsError("invalid-argument", r.reason);
  const name = r.ok ? r.name : fallbackName(uid);
  await db.doc(`profiles/${uid}`).set({ name });
  return { name };
});

/** A changed display name follows onto the PP board, the last two days' daily boards and shared quotes. */
export const renameOnBoards = onDocumentWritten("profiles/{uid}", async (event) => {
  const raw = event.data?.after?.data()?.name;
  if (!raw) return;
  const { uid } = event.params;
  const name = safeName(raw, uid);
  // a name that got past the check some other way: replace it, and this runs again with the new one
  if (name !== raw) { await event.data.after.ref.set({ name }); return; }
  const days = [0, 1].map((n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10));
  const quotes = await db.collection("quotes").where("uid", "==", uid).get();
  const refs = [ppRef(uid), ...days.flatMap((day) => ["daily", "dsurv"].map((b) => db.doc(`boards/${b}-${day}/entries/${uid}`))), ...quotes.docs.map((d) => d.ref)];
  await Promise.all(refs.map(async (ref) => {
    const snap = await ref.get();
    if (snap.exists && snap.data().name !== name) await ref.update({ name });
  }));
});

/* ---------- shared quotes ---------- */
// Players send quotes in through submitQuotes; each one is screened, then waits for an admin
// (anyone with a document at admins/{uid}) to approve it. Only approved quotes are public.
// Browsers can't write to quotes/ at all: every change comes through here.

const quoteRef = (id) => db.doc(`quotes/${id}`);
const needUser = (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return uid;
};
const isAdmin = async (uid) => (await db.doc(`admins/${uid}`).get()).exists;
const needAdmin = async (req) => {
  const uid = needUser(req);
  if (!(await isAdmin(uid))) throw new HttpsError("permission-denied", "Admins only.");
  return uid;
};

/** quotes: [{ text, source, by, series }]. Returns one { id, ok, live, reason } per quote, in order. Admins skip the caps and the queue. */
export const submitQuotes = onCall(async (req) => {
  const uid = needUser(req);
  const list = Array.isArray(req.data?.quotes) ? req.data.quotes.slice(0, SHARE_RULES.batch) : [];
  if (!list.length) throw new HttpsError("invalid-argument", "No quotes sent.");
  const lim = limitsFor(await isAdmin(uid));
  const pending = lim.pending === Infinity ? 0 : (await db.collection("quotes").where("uid", "==", uid).where("status", "==", "pending").count().get()).data().count;
  const name = await nameOf(uid), now = Date.now(), limitRef = db.doc(`quoteLimits/${uid}`);
  return db.runTransaction(async (tx) => {
    const screened = list.map((q) => (q && typeof q === "object" ? screenQuote({ text: q.text, source: q.source, by: q.by, series: q.series }) : { ok: false, reason: "Not a quote." }));
    const ids = screened.map((s) => (s.ok ? sharedId(s.quote.text) : null));
    const existing = await Promise.all(ids.map((id) => (id ? tx.get(quoteRef(id)) : null)));
    const limit = countToday((await tx.get(limitRef)).data(), now);
    let room = Math.min(lim.perDay - limit.n, lim.pending - pending), added = 0;
    const seen = new Set(), out = [];
    screened.forEach((s, i) => {
      const id = ids[i];
      if (!s.ok) return out.push({ id, ok: false, reason: s.reason });
      if (existing[i]?.exists) return out.push({ id, ok: false, reason: existingVerdict(existing[i].data(), uid) });
      if (seen.has(id)) return out.push({ id, ok: false, reason: "That's in this list twice." });
      if (room <= 0) return out.push({ id, ok: false, reason: limit.n + added >= lim.perDay ? `That's ${lim.perDay} for today; send the rest tomorrow.` : `You have ${lim.pending} waiting for review; send more once some are through.` });
      seen.add(id); room--; added++;
      tx.set(quoteRef(id), submission({ quote: s.quote, flags: s.flags, uid, name, now, status: lim.status }));
      out.push({ id, ok: true, live: lim.status === "approved" });
    });
    if (added) tx.set(limitRef, { day: limit.day, n: limit.n + added });
    return { results: out };
  });
});

/** Take back a quote of your own, waiting or live. */
export const withdrawQuote = onCall(async (req) => {
  const uid = needUser(req), id = String(req.data?.id || "");
  const snap = await quoteRef(id).get();
  if (!snap.exists || snap.data().uid !== uid) throw new HttpsError("not-found", "That isn't one of yours.");
  await quoteRef(id).delete();
  return { ok: true };
});

/** One report per player per quote; enough of them hide it until an admin looks. */
export const reportQuote = onCall(async (req) => {
  const uid = needUser(req), id = String(req.data?.id || ""), reason = String(req.data?.reason || "");
  const repRef = db.doc(`quotes/${id}/reports/${uid}`);
  return db.runTransaction(async (tx) => {
    const [q, rep] = await Promise.all([tx.get(quoteRef(id)), tx.get(repRef)]);
    const r = report(q.exists ? q.data() : null, { uid, reason, already: rep.exists });
    if (r.error) throw new HttpsError("failed-precondition", r.error);
    if (r.counted) {
      tx.set(repRef, { uid, reason, at: Date.now() });
      tx.update(quoteRef(id), { reports: r.doc.reports, status: r.doc.status });
    }
    return { ok: true, hidden: r.doc.status === "hidden" };
  });
});

/** Admins: approve (optionally with edits), reject, restore a hidden quote, or remove a live one. */
export const reviewQuote = onCall(async (req) => {
  await needAdmin(req);
  const id = String(req.data?.id || ""), { action, reason, edits } = req.data || {};
  const snap = await quoteRef(id).get();
  const r = review(snap.exists ? snap.data() : null, { action, reason, edits }, Date.now());
  if (r.error) throw new HttpsError("failed-precondition", r.error);
  await quoteRef(id).set(r.doc);
  if (action === "restore") {
    const reps = await db.collection(`quotes/${id}/reports`).get();
    const batch = db.batch(); reps.docs.forEach((d) => batch.delete(d.ref)); await batch.commit();
  }
  return { ok: true, quote: r.doc };
});

/** Clearing progress deletes the account; quotes stay up, but no longer carry a name. */
export const forgetQuoteNames = onDocumentDeleted("users/{uid}", async (event) => {
  const snap = await db.collection("quotes").where("uid", "==", event.params.uid).get();
  await Promise.all(snap.docs.map((d) => d.ref.update({ name: "" })));
});

/**
 * Friend rooms live in the Realtime Database and nobody deletes them when they leave, so rooms
 * made more than a day ago are cleared out every six hours, with quick-race lobby entries an hour stale.
 */
const ROOMS_DB = "https://retype-883ba-default-rtdb.europe-west1.firebasedatabase.app";
export const clearOldRooms = onSchedule("every 6 hours", async () => {
  const rooms = getDatabase(undefined, ROOMS_DB).ref("rooms");
  const old = await rooms.orderByChild("created").endAt(Date.now() - 86400000).limitToFirst(500).get();
  const gone = {};
  old.forEach((s) => { gone[s.key] = null; });
  if (Object.keys(gone).length) await rooms.update(gone);
  // and lobby entries for public rooms nobody has touched in an hour
  const lobby = getDatabase(undefined, ROOMS_DB).ref("lobby");
  const stale = await lobby.orderByChild("at").endAt(Date.now() - 3600000).limitToFirst(500).get();
  const dead = {};
  stale.forEach((s) => { dead[s.key] = null; });
  if (Object.keys(dead).length) await lobby.update(dead);
  logger.info("cleared old rooms", { rooms: Object.keys(gone).length, lobby: Object.keys(dead).length });
});

/**
 * Names in friend rooms are written by the browser straight into the Realtime Database (they
 * come from the checked profile, but a browser could write anything). One that fails the check
 * is replaced within a moment, before strangers in a quick race have much chance to see it.
 */
export const screenRoomName = onValueWritten({ ref: "/rooms/{code}/players/{uid}/name", instance: "retype-883ba-default-rtdb" }, async (event) => {
  const raw = event.data.after.val();
  if (typeof raw !== "string") return;
  const name = safeName(raw, event.params.uid);
  if (name !== raw) await event.data.after.ref.set(name);
});
