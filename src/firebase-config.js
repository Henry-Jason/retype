// The web app's Firebase settings, from Firebase console → Project settings → Your apps.
// These aren't secrets: every visitor's browser receives them. The Firestore security rules
// (firestore.rules) are what keep each person's data private.
// Set it to null to run guest-only, with no sign-in button.
export const firebaseConfig = {
  apiKey: "AIzaSyDT0h3ZKDl7CBkoYC1rCrn0l2HD4i-KO34",
  authDomain: "retype-883ba.firebaseapp.com",
  projectId: "retype-883ba",
  storageBucket: "retype-883ba.firebasestorage.app",
  messagingSenderId: "1001287894242",
  appId: "1:1001287894242:web:ae27954081cfb41c578abb",
  // friend rooms: the Realtime Database, made in europe-west1 (see README → Friend rooms)
  databaseURL: "https://retype-883ba-default-rtdb.europe-west1.firebasedatabase.app"
};

// `npm run dev:emulators` points the app at local Auth, Firestore and Realtime Database emulators instead.
export const emulatorConfig = { apiKey: "demo-key", authDomain: "demo-retype.firebaseapp.com", projectId: "demo-retype", appId: "demo-app", databaseURL: "http://127.0.0.1:9000?ns=demo-retype-default-rtdb" };
