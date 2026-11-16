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
  appId: "1:1001287894242:web:ae27954081cfb41c578abb"
};

// `npm run dev:emulators` points the app at local Auth and Firestore emulators instead.
export const emulatorConfig = { apiKey: "demo-key", authDomain: "demo-retype.firebaseapp.com", projectId: "demo-retype", appId: "demo-app" };
