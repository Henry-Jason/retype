// Copies the shared scoring code into functions/shared before a functions deploy, so the
// server checks galleys with exactly the code the app scores them with.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
rmSync(join(root, "functions", "shared"), { recursive: true, force: true });
for (const dir of ["core", "data"]) cpSync(join(root, "src", dir), join(root, "functions", "shared", dir), { recursive: true });
console.log("Copied src/core and src/data into functions/shared");
