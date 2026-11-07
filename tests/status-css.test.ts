import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { themeCss } from "../src/ui/theme-tokens";

const ROOT = join(__dirname, "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const css = read("src/status/status.css");

function tokensBlock(source: string): string {
  const match =
    /\/\* tokens:start \*\/\s*([\s\S]*?)\s*\/\* tokens:end \*\//.exec(source);
  return (match?.[1] ?? "").replace(/\s+/g, "").toLowerCase();
}

describe("status stylesheet", () => {
  it("embeds the theme tokens exactly", () => {
    expect(tokensBlock(css)).toBe(
      themeCss(":root").replace(/\s+/g, "").toLowerCase(),
    );
  });

  it.each(["body", "section", "button", "select"])("styles %s", (selector) => {
    const rule = new RegExp(`(^|[\\s,}])${selector}\\b[^{]*\\{`, "m");
    expect(
      rule.test(css.replace(/\/\* tokens:start[\s\S]*tokens:end \*\//, "")),
    ).toBe(true);
  });

  it("is linked by the page and copied by the build", () => {
    expect(read("src/status/status.html")).toContain(
      '<link rel="stylesheet" href="status.css" />',
    );
    expect(read("scripts/build.mjs")).toContain("src/status/status.css");
  });
});
