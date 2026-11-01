import { describe, expect, it } from "vitest";
import { normalizeTitle } from "../src/core/normalize-title";
import {
  matchTitle,
  type NakaTitle,
  type ScCandidate,
} from "../src/core/title-match";

describe("normalizeTitle", () => {
  it("removes accents and lower-cases", () => {
    expect(normalizeTitle("Amélie")).toBe("amelie");
  });

  it("treats punctuation as a space and collapses spaces", () => {
    expect(normalizeTitle("Spider-Man  2")).toBe("spider man 2");
  });
});

const grinch: NakaTitle = {
  title: "Le Grinch",
  originalTitle: "How the Grinch Stole Christmas",
  year: 2000,
  type: "film",
};

const grinch2000: ScCandidate = {
  productId: 1,
  title: "Le Grinch",
  originalTitle: "How the Grinch Stole Christmas",
  year: 2000,
  type: "film",
};

const grinch2018: ScCandidate = {
  productId: 2,
  title: "Le Grinch",
  originalTitle: "The Grinch",
  year: 2018,
  type: "film",
};

describe("matchTitle", () => {
  it("prefers the candidate with the exact year", () => {
    expect(matchTitle(grinch, [grinch2000, grinch2018])).toEqual({
      kind: "match",
      productId: 1,
    });
  });

  it("is ambiguous when the Naka year is unknown", () => {
    const naka = { ...grinch, year: undefined };
    expect(matchTitle(naka, [grinch2000, grinch2018])).toEqual({
      kind: "ambiguous",
      productIds: [1, 2],
    });
  });

  it("matches a lone candidate one year off", () => {
    const candidate = { ...grinch2000, year: 2001 };
    expect(matchTitle(grinch, [candidate])).toEqual({
      kind: "match",
      productId: 1,
    });
  });

  it("is ambiguous for a lone candidate five years off", () => {
    const candidate = { ...grinch2000, year: 2005 };
    expect(matchTitle(grinch, [candidate])).toEqual({
      kind: "ambiguous",
      productIds: [1],
    });
  });

  it("ignores candidates of another type", () => {
    const naka: NakaTitle = { title: "Batman", year: 1966, type: "serie" };
    const film: ScCandidate = {
      productId: 3,
      title: "Batman",
      year: 1989,
      type: "film",
    };
    expect(matchTitle(naka, [film])).toEqual({ kind: "none" });
  });

  it("returns none without candidates", () => {
    expect(matchTitle(grinch, [])).toEqual({ kind: "none" });
  });

  it("returns none for an empty Naka title", () => {
    const naka: NakaTitle = { title: "", year: 2000, type: "film" };
    const blank: ScCandidate = {
      productId: 4,
      title: "",
      year: 2000,
      type: "film",
    };
    expect(matchTitle(naka, [blank])).toEqual({ kind: "none" });
  });

  it("matches across accents", () => {
    const naka: NakaTitle = { title: "Amélie", type: "film", year: 2001 };
    const sc: ScCandidate = {
      productId: 5,
      title: "Amelie",
      year: 2001,
      type: "film",
    };
    expect(matchTitle(naka, [sc])).toEqual({ kind: "match", productId: 5 });
  });

  it("matches across hyphens", () => {
    const naka: NakaTitle = { title: "Spider-Man", type: "film", year: 2002 };
    const sc: ScCandidate = {
      productId: 6,
      title: "Spider Man",
      year: 2002,
      type: "film",
    };
    expect(matchTitle(naka, [sc])).toEqual({ kind: "match", productId: 6 });
  });
});
