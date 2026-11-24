// Keeping this browser and the account in step. The cloud is passed in (see cloud.js for the
// real one, tests/account-sync.test.js for a fake), so the rules about what gets uploaded,
// when, and how it's merged can be tested without Firebase.
//
// cloud: {
//   getAccount(uid) -> doc | null
//   foldAccount(uid, fn) -> doc      runs fn(current doc | null) in a transaction, saves and returns the result
//   putResult(uid, cloudResult)      resolves if the galley is stored (including if it already was)
//   recentResults(uid, n) -> [cloudResult]   newest first
//   deleteAll(uid)
// }
//
// Local bookkeeping in the store's meta records:
//   "account"  the uid this browser's data belongs to (absent for a guest)
//   "pending"  ids of galleys finished here that the account hasn't counted yet
import { mergeGuest, foldResult, mergeRecent, toCloud, fromCloud, docFrom, RECENT, defaultName } from "../core/sync.js";
import { dayKey } from "../core/progress.js";

const DOC_KEYS = ["bests", "weak", "days", "bestStreak", "totals", "xp", "top", "feats"];

async function saveDoc(store, doc) {
  await Promise.all(DOC_KEYS.map((k) => store.set(k, doc[k])));
}
const withDoc = (state, doc) => ({ ...state, ...Object.fromEntries(DOC_KEYS.map((k) => [k, doc[k]])) });

/**
 * Signing in, or opening the app while signed in. Uploads whatever the account hasn't seen,
 * folds it in, pulls the account's latest galleys, and returns the new local state.
 * A guest's galleys all count as pending the first time this browser meets the account.
 */
export async function syncAccount({ store, cloud, uid, state, today = dayKey(Date.now()) }) {
  const linked = await store.get("account");
  const pendingIds = linked === uid ? (await store.get("pending")) || [] : (await store.all()).map((r) => r.id);
  const pending = (await Promise.all(pendingIds.map((id) => store.getResult(id)))).filter(Boolean);

  for (const r of pending) await cloud.putResult(uid, toCloud(r, uid));
  const local = { weak: state.weak, bestStreak: state.bestStreak, top: state.top, feats: state.feats };
  const doc = docFrom(await cloud.foldAccount(uid, (cur) => mergeGuest(cur, local, pending, today)));

  const remote = (await cloud.recentResults(uid, RECENT)).map(fromCloud);
  for (const r of pending) await store.addResult({ ...r, userId: uid });
  for (const r of remote) await store.addResult(r);
  await saveDoc(store, doc);
  await store.set("account", uid);
  await store.set("pending", []);

  const mine = state.recent.map((r) => ({ ...r, userId: uid }));
  return withDoc({ ...state, recent: mergeRecent(remote, mine) }, doc);
}

/**
 * A galley just finished (and was already saved locally by record()). If this browser
 * belongs to an account, the galley is marked pending first, so a failed upload is
 * retried at the next sync rather than lost.
 * Returns the new state, or null when there's nothing to do or the upload failed.
 */
export async function pushGalley({ store, cloud, uid, state, result, words, today = dayKey(Date.now()) }) {
  const linked = await store.get("account");
  if (!linked) return null;
  const pending = (await store.get("pending")) || [];
  if (!pending.includes(result.id)) await store.set("pending", [...pending, result.id]);
  if (!uid || !cloud || uid !== linked) return null;
  try {
    await cloud.putResult(uid, toCloud(result, uid));
    const doc = docFrom(await cloud.foldAccount(uid, (cur) => foldResult(cur, result, words, today)));
    await saveDoc(store, doc);
    await store.set("pending", ((await store.get("pending")) || []).filter((id) => id !== result.id));
    return withDoc(state, doc);
  } catch (e) {
    console.warn("Couldn't sync this galley yet; it will be retried", e);
    return null;
  }
}

/** Make sure the account has a display name for the boards; returns it. */
export async function ensureProfile({ cloud, user }) {
  const p = await cloud.getProfile(user.uid);
  if (p?.name) return p.name;
  // the first name comes from the Google account; the server swaps it for "Typist ABCD" if it can't be shown
  return cloud.setName(defaultName(user), { fallback: true });
}

/**
 * Galleys typed before PP existed are scored onto the PP board once, by the server. Asks for
 * that when the account has galleys that earn PP but its board entry hasn't been backfilled.
 */
export async function ensurePpBoard({ cloud, uid, state }) {
  if (!cloud?.ppEntry || !state.top?.length) return false;
  const e = await cloud.ppEntry(uid);
  if (e?.backfilled) return false;
  await cloud.backfillPp();
  return true;
}

/** Signing out: this browser forgets the account's data. The account keeps everything. */
export async function forgetAccount(store) {
  await store.clear();
}

/** Clearing progress while signed in removes it from the account as well. */
export async function clearAccount({ store, cloud, uid }) {
  await cloud.deleteAll(uid);
  await store.clear();
  await store.set("account", uid);
  await store.set("pending", []);
}
