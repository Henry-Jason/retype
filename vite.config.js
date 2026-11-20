import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src/", import.meta.url));

export default defineConfig({
  build: { target: "es2020", outDir: "dist" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    // The Cloud Functions import "./shared/core/…", a copy of src/core and src/data made at deploy
    // time. Tests read the originals instead, so they never depend on (or race to rebuild) the copy.
    alias: [{ find: /^\.\/shared\/(core|data)\/(.*)$/, replacement: `${src}$1/$2` }]
  }
});
