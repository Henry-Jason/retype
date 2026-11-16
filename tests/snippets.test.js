import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { SNIPPETS, tokenize, scriptLines } from "../src/core/code.js";

let python = null;
try { execFileSync("python3", ["--version"]); python = "python3"; } catch { /* no python: skip the run check */ }

describe("code snippets", () => {
  it("have unique ids and explanations", () => {
    expect(new Set(SNIPPETS.map((s) => s.id)).size).toBe(SNIPPETS.length);
    for (const s of SNIPPETS) expect(s.explain.length).toBeGreaterThan(40);
  });
  it.runIf(python)("print exactly the stored output", () => {
    for (const s of SNIPPETS) {
      const out = execFileSync(python, ["-I", "-c", s.code], { encoding: "utf8" });
      expect(out.replace(/\n$/, ""), s.title).toBe(s.output);
    }
  });
});

describe("tokenize", () => {
  it("marks keywords, functions, numbers, strings and comments", () => {
    const tk = tokenize('for n in range(1, 16):  # count');
    expect(tk.slice(0, 3)).toEqual(["tk-kw", "tk-kw", "tk-kw"]);
    expect(tk[9]).toBe("tk-fn");
    expect(tk[15]).toBe("tk-num");
    expect(tk[tk.length - 1]).toBe("tk-com");
    expect(tokenize('x = f"{a}"').slice(4).every((c) => c === "tk-str")).toBe(true);
  });
});

describe("scriptLines", () => {
  const code = "def f():\n    return 1\n\nprint(f())";
  it("strips indentation from what you type when it's automatic", () => {
    const l = scriptLines(code, "auto");
    expect(l[1]).toMatchObject({ n: 2, indent: 4, target: "return 1" });
    expect(l[2]).toEqual({ n: 3, blank: true });
  });
  it("keeps it when indentation is manual", () => {
    const l = scriptLines(code, "manual");
    expect(l[1].target).toBe("    return 1");
    expect(l[1].tokens.slice(0, 4)).toEqual(["", "", "", ""]);
  });
});
