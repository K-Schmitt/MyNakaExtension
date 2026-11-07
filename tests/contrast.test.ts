import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/ui/contrast";
import { THEME } from "../src/ui/theme-tokens";

const C = THEME.color;

describe("contrastRatio", () => {
  it("is 21 for white on black", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 2);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
  });

  it("matches the known ratio of the accent on the surface", () => {
    expect(Math.abs(contrastRatio("#1959D7", "#161B26") - 2.83)).toBeLessThan(
      0.01,
    );
  });
});

describe("theme contrast", () => {
  const textPairs: [string, string, string][] = [
    ["text/surface", C.text, C.surface],
    ["text/raised", C.text, C.surfaceRaised],
    ["textSecondary/surface", C.textSecondary, C.surface],
    ["textTertiary/surface", C.textTertiary, C.surface],
    ["accentText/surface", C.accentText, C.surface],
    ["warningText/warningBg", C.warningText, C.warningBg],
    ["errorText/errorBg", C.errorText, C.errorBg],
    ["successText/successBg", C.successText, C.successBg],
    ["onAccent/accent", C.onAccent, C.accent],
  ];
  for (const [name, fg, bg] of textPairs) {
    it(`${name} is at least 4.5`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  const graphicPairs: [string, string, string][] = [
    ["starEmpty/surface", C.starEmpty, C.surface],
    ["starFilled/surface", C.starFilled, C.surface],
    ["focus ring/surface", C.accentText, C.surface],
  ];
  for (const [name, fg, bg] of graphicPairs) {
    it(`${name} is at least 3`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(3);
    });
  }
});
