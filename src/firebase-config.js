// The web app's Firebase settings, from Firebase console → Project settings → Your apps.
// These aren't secrets: every visitor's browser receives them. The Firestore security rules
// (firestore.rules) are what keep each person's data private.
// While this is null the app runs as a guest only, with no sign-in button.
export const firebaseConfig = null;

// `npm run dev:emulators` points the app at local Auth and Firestore emulators instead.
export const emulatorConfig = { apiKey: "demo-key", authDomain: "demo-retype.firebaseapp.com", projectId: "demo-retype", appId: "demo-app" };
