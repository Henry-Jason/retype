// The real cloud: Firebase Auth (Google sign-in) and Firestore. Loaded on demand, so a guest
// who never signs in mostly doesn't pay for it. See account-sync.js for what's done with it.
export async function createCloud(config, { emulators = false } = {}) {
  const [{ initializeApp }, A, F] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
  if (emulators) {
    A.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    F.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  const account = (uid) => F.doc(db, "users", uid);
  const result = (uid, id) => F.doc(db, "users", uid, "results", id);
  const results = (uid) => F.collection(db, "users", uid, "results");
  const quotes = F.collection(db, "quotes");
  let fns = null;
  async function call(name, data) {
    if (!fns) {
      const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import("firebase/functions");
      const f = getFunctions(app, "europe-west1");
      if (emulators) connectFunctionsEmulator(f, "127.0.0.1", 5001);
      fns = (n) => httpsCallable(f, n);
    }
    return (await fns(name)(data)).data;
  }
  const rows = (snap) => snap.docs.map((d) => d.data());

  return {
    onUser(cb) {
      return A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, name: u.displayName || "", email: u.email || "", photo: u.photoURL || "" } : null));
    },
    async signIn() {
      const provider = new A.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await A.signInWithPopup(auth, provider);
    },
    signOut: () => A.signOut(auth),

    async getAccount(uid) {
      const s = await F.getDoc(account(uid));
      return s.exists() ? s.data() : null;
    },
    async foldAccount(uid, fn) {
      return F.runTransaction(db, async (tx) => {
        const s = await tx.get(account(uid));
        const next = fn(s.exists() ? s.data() : null);
        tx.set(account(uid), { ...next, updated: Date.now() });
        return next;
      });
    },
    async putResult(uid, r) {
      try {
        await F.setDoc(result(uid, r.id), r);
      } catch (e) {
        // results can't be overwritten, so a retried upload of one that's already there is
        // refused; that's fine. Anything else is a real failure.
        if (e?.code === "permission-denied" && (await F.getDoc(result(uid, r.id))).exists()) return;
        throw e;
      }
    },
    async recentResults(uid, n) {
      const snap = await F.getDocs(F.query(results(uid), F.orderBy("at", "desc"), F.limit(n)));
      return snap.docs.map((d) => d.data());
    },
    async getProfile(uid) {
      const s = await F.getDoc(F.doc(db, "profiles", uid));
      return s.exists() ? s.data() : null;
    },
    setProfile: (uid, name) => F.setDoc(F.doc(db, "profiles", uid), { name }),
    // board: "daily" (ordered by score) or "dsurv", the daily survival run (ordered by rank:
    // words survived, then score)
    async dailyBoard(day, n = 50, board = "daily") {
      const snap = await F.getDocs(F.query(F.collection(db, "boards", `${board}-${day}`, "entries"), F.orderBy(board === "dsurv" ? "rank" : "score", "desc"), F.limit(n)));
      return snap.docs.map((d) => d.data());
    },
    async dailyEntry(day, uid, board = "daily") {
      const s = await F.getDoc(F.doc(db, "boards", `${board}-${day}`, "entries", uid));
      return s.exists() ? s.data() : null;
    },
    /** Place on the board for a score (a rank on the survival board), and how many are on it. */
    async dailyPlace(day, score, board = "daily") {
      const entries = F.collection(db, "boards", `${board}-${day}`, "entries");
      const [above, all] = await Promise.all([
        F.getCountFromServer(F.query(entries, F.where(board === "dsurv" ? "rank" : "score", ">", score))),
        F.getCountFromServer(entries)
      ]);
      return { place: above.data().count + 1, of: all.data().count };
    },
    async ppBoard(n = 50) {
      const snap = await F.getDocs(F.query(F.collection(db, "boards", "pp", "entries"), F.orderBy("pp", "desc"), F.limit(n)));
      return snap.docs.map((d) => d.data());
    },
    async ppEntry(uid) {
      const s = await F.getDoc(F.doc(db, "boards", "pp", "entries", uid));
      return s.exists() ? s.data() : null;
    },
    async ppPlace(pp) {
      const entries = F.collection(db, "boards", "pp", "entries");
      const [above, all] = await Promise.all([
        F.getCountFromServer(F.query(entries, F.where("pp", ">", pp))),
        F.getCountFromServer(entries)
      ]);
      return { place: above.data().count + 1, of: all.data().count };
    },
    /** Ask the server to score the galleys this account had before PP existed (once). */
    backfillPp: () => call("backfillPp"),

    /* ---------- your quotes and favourites ---------- */
    async getSaved(uid) {
      const s = await F.getDoc(F.doc(db, "users", uid, "saved", "quotes"));
      return s.exists() ? s.data() : null;
    },
    /** Read your saved quotes, merge in this browser's with fn, and write the result back, atomically. */
    async foldSaved(uid, fn) {
      const ref = F.doc(db, "users", uid, "saved", "quotes");
      return F.runTransaction(db, async (tx) => {
        const s = await tx.get(ref);
        const next = fn(s.exists() ? s.data() : null);
        tx.set(ref, { v: 1, quotes: next.quotes, deleted: next.deleted, favs: next.favs, updated: Date.now() });
        return next;
      });
    },

    /* ---------- shared quotes ---------- */
    /** Every approved quote; anyone can read these, signed in or not. */
    async approvedQuotes() { return rows(await F.getDocs(F.query(quotes, F.where("status", "==", "approved"), F.limit(5000)))); },
    /** Everything you've sent in, whatever became of it. */
    async myShared(uid) { return rows(await F.getDocs(F.query(quotes, F.where("uid", "==", uid)))); },
    async isAdmin(uid) {
      try { return (await F.getDoc(F.doc(db, "admins", uid))).exists(); } catch { return false; }
    },
    /** Admins: what's waiting, and anything live that's been reported or hidden, with the reports. */
    async quoteQueue() {
      const [waiting, reported] = await Promise.all([
        F.getDocs(F.query(quotes, F.where("status", "in", ["pending", "hidden"]), F.limit(500))),
        F.getDocs(F.query(quotes, F.where("reports", ">", 0), F.limit(200)))
      ]);
      const all = new Map([...rows(waiting), ...rows(reported).filter((q) => q.status === "approved")].map((q) => [q.id, q]));
      await Promise.all([...all.values()].filter((q) => q.reports > 0).map(async (q) => {
        q.reportList = rows(await F.getDocs(F.collection(db, "quotes", q.id, "reports")));
      }));
      return [...all.values()];
    },
    submitQuotes: (list) => call("submitQuotes", { quotes: list }),
    withdrawQuote: (id) => call("withdrawQuote", { id }),
    reportQuote: (id, reason) => call("reportQuote", { id, reason }),
    reviewQuote: (id, action, extra = {}) => call("reviewQuote", { id, action, ...extra }),
    async deleteAll(uid) {
      for (;;) {
        const snap = await F.getDocs(F.query(results(uid), F.limit(400)));
        if (snap.empty) break;
        const batch = F.writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await F.deleteDoc(account(uid));
      await F.deleteDoc(F.doc(db, "profiles", uid));
    }
  };
}
