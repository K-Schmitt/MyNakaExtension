import { describe, expect, it } from "vitest";
import { THEME, themeCss } from "../src/ui/theme-tokens";

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

describe("themeCss", () => {
  it("opens with the scope and carries the accent text colour", () => {
    const css = themeCss(":host");
    expect(css.startsWith(":host{")).toBe(true);
    expect(css).toContain("--mn-color-accent-text:#76B6FE;");
  });

  it("uses the :root scope when asked", () => {
    expect(themeCss(":root").startsWith(":root{")).toBe(true);
  });

  it("declares every colour once", () => {
    const css = themeCss(":host");
    for (const key of Object.keys(THEME.color)) {
      const name = `--mn-color-${kebab(key)}:`;
      expect(css.split(name).length - 1, name).toBe(1);
    }
  });

  it("declares radii, spaces, text sizes and the single tokens", () => {
    const css = themeCss(":host");
    expect(css).toContain("--mn-radius-pill:999px;");
    expect(css).toContain("--mn-space-3:12px;");
    expect(css).toContain("--mn-text-body:14px/20px;");
    expect(css).toContain("--mn-font:Inter, system-ui");
    expect(css).toContain("--mn-shadow:0 8px 24px rgba(0, 0, 0, 0.45);");
    expect(css).toContain("--mn-motion:120ms;");
    expect(css).toContain("--mn-surface-alpha:0.96;");
  });
});
