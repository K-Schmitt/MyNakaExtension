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

  it("gives false for absent isReviewed and isRecommended", () => {
    const state = stateOf();
    expect(state.isReviewed).toBe(false);
    expect(state.isRecommended).toBe(false);
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
