import { describe, expect, it } from "vitest";
import { readProductState } from "../src/sc/sc-product-state";

function stateOf(
  infosExtra: Record<string, unknown> = {},
  productExtra: Record<string, unknown> = {},
) {
  return readProductState(
    {
      data: {
        product: {
          id: 5,
          universe: 1,
          currentUserInfos: {
            isDone: true,
            isWished: false,
            productId: 5,
            rating: null,
            ...infosExtra,
          },
          ...productExtra,
        },
      },
    } as never,
    5,
  );
}

describe("readProductState: what an undo restores", () => {
  it("keeps a YYYY-MM-DD dateDone", () => {
    expect(stateOf({ dateDone: "2026-11-02" }).dateDone).toBe("2026-11-02");
  });

  it.each([
    ["null", null],
    ["a datetime", "2026-11-02T10:00:00Z"],
    ["a number", 1700000000],
    ["an empty string", ""],
    ["absent", undefined],
  ])("gives a null dateDone for %s", (_name, value) => {
    expect(stateOf({ dateDone: value }).dateDone).toBeNull();
  });

  it.each([
    ["isReviewed", true],
    ["isReviewed", false],
    ["isRecommended", true],
    ["isRecommended", false],
  ] as const)("reads %s = %s", (key, value) => {
    expect(stateOf({ [key]: value })[key]).toBe(value);
  });

  // Fails closed (owner decision D13, 2026-11-14): a flag SensCritique did not answer as a boolean
  // counts as a critique or recommendation, so nothing that could drop one is offered.
  it.each([
    ["absent", undefined],
    ["null", null],
    ['the string "false"', "false"],
    ["0", 0],
  ])("reads isReviewed and isRecommended %s as protected", (_name, value) => {
    const state = stateOf({ isReviewed: value, isRecommended: value });
    expect(state.isReviewed).toBe(true);
    expect(state.isRecommended).toBe(true);
  });

  it("reads one unknown flag as protected without touching the other", () => {
    const state = stateOf({ isReviewed: false, isRecommended: null });
    expect(state.isReviewed).toBe(false);
    expect(state.isRecommended).toBe(true);
  });

  it.each([
    ["a film path", "/film/Foo_Bar-1/123", true],
    ["a season path", "/serie/Foo/456/S2", true],
    ["a protocol-relative url", "//evil", false],
    ["a javascript url", "javascript:alert(1)", false],
    ["an absolute url", "https://x", false],
    ["a path with ..", "/film/../123", false],
    ["an empty string", "", false],
  ])("url: %s", (_name, path, kept) => {
    expect(stateOf({}, { url: path }).url).toBe(
      kept ? `https://www.senscritique.com${path}` : undefined,
    );
  });

  it("gives an undefined url when the product has none", () => {
    expect(stateOf().url).toBeUndefined();
  });
});
