import { describe, expect, it } from "vitest";
import {
  isProductUrl,
  MAX_PRODUCT_URL,
  productUrlOf,
} from "../src/sc/product-url";

const FILM = "https://www.senscritique.com/film/solaris/2005";

describe("productUrlOf", () => {
  it("makes a product path absolute", () => {
    expect(productUrlOf("/film/solaris/2005")).toBe(FILM);
  });

  it("gives nothing for a path whose page would pass the cap", () => {
    const slug = "a".repeat(MAX_PRODUCT_URL);
    expect(productUrlOf(`/film/${slug}/1`)).toBeUndefined();
  });

  it("gives nothing for a value that is not text", () => {
    expect(productUrlOf(42)).toBeUndefined();
  });
});

describe("isProductUrl", () => {
  it("accepts a film page and a season page", () => {
    expect(isProductUrl(FILM)).toBe(true);
    expect(isProductUrl("https://www.senscritique.com/serie/dark/13/S2")).toBe(
      true,
    );
  });

  it.each([
    "http://www.senscritique.com/film/solaris/2005",
    "https://www.senscritique.com.evil.com/film/solaris/2005",
    "https://www.senscritique.com//evil.com/a/1",
    "https://www.senscritique.com/film/solaris/2005?x=1",
  ])("refuses %s", (url) => {
    expect(isProductUrl(url)).toBe(false);
  });
});
