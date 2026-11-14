import { describe, expect, it } from "vitest";
import {
  BLOCK_SHEET,
  REDUCED_MOTION_RULE,
} from "../src/content/ui/block-styles";
import { createEndUi } from "../src/content/ui/end-ui";
import {
  EPISODE_STARS_SHEET,
  PANEL_SHEET,
} from "../src/content/ui/fiche-styles";
import { ratingView } from "../src/content/ui/rating-view";
import { themeCss } from "../src/ui/theme-tokens";
import { filmCard } from "./rating-fixtures";
import { FakeDoc } from "./ui-fakes";

const SELECTORS = [
  ".mn-card",
  ".mn-card::before",
  ".mn-title",
  ".mn-line",
  ".mn-warning",
  ".mn-error",
  ".mn-row",
  ".mn-stars",
  ".mn-stars-value",
  ".mn-star",
  ".mn-star:focus-visible",
  ".mn-btn",
  ".mn-btn:hover",
  ".mn-btn:focus-visible",
  ".mn-btn:active",
  ".mn-btn--primary",
  ".mn-btn--primary:hover",
  ".mn-btn--ghost",
];

describe("BLOCK_SHEET", () => {
  it("starts with the theme tokens scoped to the host", () => {
    expect(BLOCK_SHEET.startsWith(themeCss(":host"))).toBe(true);
  });

  it.each(SELECTORS)("holds a rule for %s", (selector) => {
    expect(BLOCK_SHEET).toContain(`${selector}{`);
  });

  it("draws the card from the tokens", () => {
    expect(BLOCK_SHEET).toContain(
      "color-mix(in srgb, var(--mn-color-surface) calc(var(--mn-surface-alpha) * 100%), transparent)",
    );
    expect(BLOCK_SHEET).toContain('content:"SensCritique"');
    expect(BLOCK_SHEET).toContain(
      "outline:2px solid var(--mn-color-accent-text)",
    );
  });

  it("declares .mn-line before the classes that refine it", () => {
    const at = (selector: string) => BLOCK_SHEET.indexOf(`${selector}{`);
    expect(at(".mn-line")).toBeLessThan(at(".mn-title"));
    expect(at(".mn-line")).toBeLessThan(at(".mn-warning"));
    expect(at(".mn-line")).toBeLessThan(at(".mn-error"));
  });

  it("draws the ghost button transparent, in the accent text colour, borderless", () => {
    expect(BLOCK_SHEET).toMatch(
      /\.mn-btn--ghost\{[^}]*background:transparent[^}]*color:var\(--mn-color-accent-text\)[^}]*border-color:transparent/,
    );
  });

  it("holds no rule of the removed home panel", () => {
    expect(BLOCK_SHEET).not.toContain(".mn-panel");
    expect(BLOCK_SHEET).not.toContain(".mn-subheading");
  });

  it("has no rule for a pressed button", () => {
    expect(BLOCK_SHEET).not.toContain("aria-pressed");
  });

  it("takes the surface opacity from the token", () => {
    expect(BLOCK_SHEET).toContain("calc(var(--mn-surface-alpha) * 100%)");
    expect(BLOCK_SHEET).not.toContain(" 96%");
  });

  it("spaces the notices, widens the stars and lets the row wrap", () => {
    expect(BLOCK_SHEET).toMatch(
      /\.mn-warning\{[^}]*margin-top:var\(--mn-space-2\)/,
    );
    expect(BLOCK_SHEET).toMatch(
      /\.mn-error\{[^}]*margin-top:var\(--mn-space-2\)/,
    );
    expect(BLOCK_SHEET).toMatch(/\.mn-star\{[^}]*min-width:24px/);
    expect(BLOCK_SHEET).toMatch(/\.mn-row--stars\{[^}]*flex-wrap:wrap/);
  });

  it("removes the transitions for reduced motion", () => {
    expect(BLOCK_SHEET).toContain("@media (prefers-reduced-motion: reduce)");
    expect(
      BLOCK_SHEET.endsWith(
        "@media (prefers-reduced-motion: reduce){.mn-btn,.mn-arrow{transition:none;}}",
      ),
    ).toBe(true);
    expect(BLOCK_SHEET).toMatch(
      /prefers-reduced-motion: reduce\)\{[^}]*transition:none/,
    );
  });

  it("the title page sheets that carry the buttons end with the reduced motion rule too", () => {
    for (const sheet of [PANEL_SHEET, EPISODE_STARS_SHEET]) {
      expect(sheet).toContain(".mn-btn{");
      expect(sheet.endsWith(REDUCED_MOTION_RULE)).toBe(true);
    }
  });
});

describe("the overlays get the sheet", () => {
  it("the end block's shadow root carries BLOCK_SHEET in a style node", () => {
    const doc = new FakeDoc();
    createEndUi(doc).show(ratingView(filmCard(), "film"), {
      onChoose: () => {},
      onAction: () => {},
      onOther: () => {},
      onConfirm: () => {},
    });
    const style = doc.created[0]?.shadow.children[0];
    expect((style as { tag?: string }).tag).toBe("style");
    expect((style as { textContent?: string }).textContent).toBe(BLOCK_SHEET);
  });
});
