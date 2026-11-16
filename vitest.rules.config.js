import { defineConfig } from "vitest/config";
// Security-rule tests need the Firestore emulator: run them with `npm run test:rules`.
export default defineConfig({ test: { environment: "node", include: ["tests-rules/**/*.test.js"], testTimeout: 20000, hookTimeout: 30000 } });
