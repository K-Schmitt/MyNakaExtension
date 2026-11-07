import { describe, expect, it } from "vitest";
import { BLOCK_SHEET } from "../src/content/ui/block-styles";
import { createEndUi } from "../src/content/ui/end-ui";
import { createHomeUi } from "../src/content/ui/home-ui";
import { homeView } from "../src/content/ui/home-view";
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
  ".mn-row--grid5",
  ".mn-btn",
  ".mn-btn:hover",
  ".mn-btn:focus-visible",
  ".mn-btn:active",
  ".mn-btn[aria-pressed=true]",
  ".mn-btn--primary",
  ".mn-btn--primary:hover",
  ".mn-panel",
  ".mn-panel-head",
  ".mn-heading",
  ".mn-subheading",
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
      "color-mix(in srgb, var(--mn-color-surface) 96%, transparent)",
    );
    expect(BLOCK_SHEET).toContain('content:"SensCritique"');
    expect(BLOCK_SHEET).toContain(
      "outline:2px solid var(--mn-color-accent-text)",
    );
  });

  it("removes the transitions for reduced motion", () => {
    expect(BLOCK_SHEET).toContain("@media (prefers-reduced-motion: reduce)");
    expect(BLOCK_SHEET).toMatch(
      /prefers-reduced-motion: reduce\)\{[^}]*transition:none/,
    );
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

  it("the home panel's shadow root carries BLOCK_SHEET in a style node", () => {
    const doc = new FakeDoc();
    createHomeUi(doc).show(homeView([{ card: filmCard() }]), {
      entry: () => ({
        onChoose: () => {},
        onAction: () => {},
        onOther: () => {},
        onConfirm: () => {},
      }),
      question: () => ({ onChoose: () => {}, onAction: () => {} }),
      onFold: () => {},
    });
    const style = doc.created[0]?.shadow.children[0];
    expect((style as { textContent?: string }).textContent).toBe(BLOCK_SHEET);
  });
});
