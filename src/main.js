import "./styles.css";
import { loadSettings } from "./ui/settings.js";
import { openStore } from "./storage/store.js";
import { loadProgress } from "./storage/progress-service.js";
import { startApp } from "./ui/app.js";
import { firebaseConfig, emulatorConfig } from "./firebase-config.js";

(async () => {
  const cfg = loadSettings();
  const store = await openStore();
  const progress = await loadProgress(store);
  // Accounts are on once the Firebase config is filled in; `npm run dev:emulators` uses local emulators.
  const emulators = import.meta.env.MODE === "emulators";
  const uitest = import.meta.env.MODE === "uitest";
  const config = uitest ? {} : emulators ? emulatorConfig : firebaseConfig;
  const cloudReady = uitest
    ? import("../tests/support/fake-cloud.js").then((m) => m.createFakeCloud())
    : config
    ? import("./storage/cloud.js").then((m) => m.createCloud(config, { emulators })).catch((e) => { console.warn("Accounts unavailable", e); return null; })
    : Promise.resolve(null);
  startApp({ cfg, store, progress, accountsEnabled: !!config, cloudReady });
})();
