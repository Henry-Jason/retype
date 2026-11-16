import "./styles.css";
import { loadSettings } from "./ui/settings.js";
import { openStore } from "./storage/store.js";
import { loadProgress } from "./storage/progress-service.js";
import { startApp } from "./ui/app.js";

(async () => {
  const cfg = loadSettings();
  const store = await openStore();
  const progress = await loadProgress(store);
  startApp({ cfg, store, progress });
})();
