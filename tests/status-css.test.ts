import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/ui/contrast";
import { THEME, themeCss } from "../src/ui/theme-tokens";

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

  it("renders native controls dark, outside the tokens block", () => {
    const outside = css.replace(/\/\* tokens:start[\s\S]*tokens:end \*\//, "");
    expect(outside).toMatch(/:root\s*\{\s*color-scheme:\s*dark;\s*\}/);
  });

  it("colours the radios with the readable accent", () => {
    expect(css).toMatch(/accent-color:\s*var\(--mn-color-accent-text\)/);
  });

  it("shows the switch state from aria-checked, with a focus ring and calm motion", () => {
    expect(css).toMatch(/\[role="switch"\]\[aria-checked="true"\]::after\s*\{/);
    expect(css).toMatch(/\[role="switch"\]::after\s*\{/);
    expect(css).toMatch(/\[role="switch"\]:focus-visible/);
    expect(css).toMatch(
      /prefers-reduced-motion[\s\S]*\[role="switch"\]::after\s*\{\s*transition:\s*none/,
    );
  });

  // WCAG 1.4.11: the edge of a field, a select or the switch track needs 3:1; the card border (13 % alpha) has 1.3:1.
  it.each([
    ['select,\\s*input\\[type="text"\\]'],
    ['\\[role="switch"\\]::after'],
  ])("draws the edge of %s with a token of at least 3:1", (selector) => {
    const rule = new RegExp(`(^|\\n)${selector}\\s*\\{([^}]*)\\}`).exec(css);
    expect(rule?.[2]).toMatch(
      /border:\s*1px solid var\(--mn-color-text-tertiary\)/,
    );
  });

  it("the tertiary text token is readable as an edge on the page and on the cards", () => {
    const C = THEME.color;
    for (const ground of [C.bg, C.surface, C.surfaceRaised]) {
      expect(contrastRatio(C.textTertiary, ground)).toBeGreaterThanOrEqual(3);
    }
  });

  it("is linked by the page and copied by the build", () => {
    expect(read("src/status/status.html")).toContain(
      '<link rel="stylesheet" href="status.css" />',
    );
    expect(read("scripts/build.mjs")).toContain("src/status/status.css");
  });
});
