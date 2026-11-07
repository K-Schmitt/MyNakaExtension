import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
const TOKENS_FILE = "src/ui/theme-tokens.ts";
// KNOWN until Task 5 moves the renderers to classes; Task 5 deletes these entries.
const KNOWN = [
  "src/content/ui/rating-render.ts",
  "src/content/ui/home-render.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const rel = (path: string): string => relative(ROOT, path);

function withoutTokensBlock(css: string): string {
  return css.replace(/\/\* tokens:start \*\/[\s\S]*?\/\* tokens:end \*\//, "");
}

describe("colour literals", () => {
  it("only the theme tokens (and the generated css block) hold one", () => {
    const sources = walk(join(ROOT, "src")).filter((p) => p.endsWith(".ts"));
    const offenders = sources
      .map(rel)
      .filter((p) => p !== TOKENS_FILE && !KNOWN.includes(p))
      .filter((p) => LITERAL.test(readFileSync(join(ROOT, p), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the status stylesheet holds none outside its tokens block", () => {
    const path = join(ROOT, "src/status/status.css");
    if (!existsSync(path)) return;
    expect(LITERAL.test(withoutTokensBlock(readFileSync(path, "utf8")))).toBe(
      false,
    );
  });

  it("the known renderers still hold literals (remove the entry when it stops)", () => {
    for (const p of KNOWN) {
      if (!existsSync(join(ROOT, p))) continue;
      expect(LITERAL.test(readFileSync(join(ROOT, p), "utf8")), p).toBe(true);
    }
  });
});
