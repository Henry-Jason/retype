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
    async dailyBoard(day, n = 50) {
      const snap = await F.getDocs(F.query(F.collection(db, "boards", `daily-${day}`, "entries"), F.orderBy("score", "desc"), F.limit(n)));
      return snap.docs.map((d) => d.data());
    },
    async dailyEntry(day, uid) {
      const s = await F.getDoc(F.doc(db, "boards", `daily-${day}`, "entries", uid));
      return s.exists() ? s.data() : null;
    },
    /** Place on the board for a score, and how many are on it. */
    async dailyPlace(day, score) {
      const entries = F.collection(db, "boards", `daily-${day}`, "entries");
      const [above, all] = await Promise.all([
        F.getCountFromServer(F.query(entries, F.where("score", ">", score))),
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
    async backfillPp() {
      const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import("firebase/functions");
      const fns = getFunctions(app, "europe-west1");
      if (emulators) connectFunctionsEmulator(fns, "127.0.0.1", 5001);
      return (await httpsCallable(fns, "backfillPp")()).data;
    },
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
