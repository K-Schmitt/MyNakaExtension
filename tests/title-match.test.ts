import { describe, expect, it } from "vitest";
import { normalizeTitle } from "../src/core/normalize-title";
import {
  type Candidate,
  matchTitle,
  type Titled,
} from "../src/core/title-match";

describe("normalizeTitle", () => {
  it("removes accents and lower-cases", () => {
    expect(normalizeTitle("Amélie")).toBe("amelie");
  });

  it("treats punctuation as a space and collapses spaces", () => {
    expect(normalizeTitle("Spider-Man  2")).toBe("spider man 2");
  });
});

const grinch: Titled = {
  title: "Le Grinch",
  originalTitle: "How the Grinch Stole Christmas",
  year: 2000,
  type: "film",
};

const grinch2000: Candidate = {
  id: 1,
  title: "Le Grinch",
  originalTitle: "How the Grinch Stole Christmas",
  year: 2000,
  type: "film",
};

const grinch2018: Candidate = {
  id: 2,
  title: "Le Grinch",
  originalTitle: "The Grinch",
  year: 2018,
  type: "film",
};

describe("matchTitle", () => {
  it("prefers the candidate with the exact year", () => {
    expect(matchTitle(grinch, [grinch2000, grinch2018])).toEqual({
      kind: "match",
      id: 1,
    });
  });

  it("is ambiguous when the Naka year is unknown", () => {
    const naka = { ...grinch, year: undefined };
    expect(matchTitle(naka, [grinch2000, grinch2018])).toEqual({
      kind: "ambiguous",
      ids: [1, 2],
    });
  });

  it("matches a lone candidate one year off", () => {
    const candidate = { ...grinch2000, year: 2001 };
    expect(matchTitle(grinch, [candidate])).toEqual({
      kind: "match",
      id: 1,
    });
  });

  it("is ambiguous for a lone candidate five years off", () => {
    const candidate = { ...grinch2000, year: 2005 };
    expect(matchTitle(grinch, [candidate])).toEqual({
      kind: "ambiguous",
      ids: [1],
    });
  });

  it("ignores candidates of another type", () => {
    const naka: Titled = { title: "Batman", year: 1966, type: "serie" };
    const film: Candidate = {
      id: 3,
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
    const naka: Titled = { title: "", year: 2000, type: "film" };
    const blank: Candidate = {
      id: 4,
      title: "",
      year: 2000,
      type: "film",
    };
    expect(matchTitle(naka, [blank])).toEqual({ kind: "none" });
  });

  it("matches across accents", () => {
    const naka: Titled = { title: "Amélie", type: "film", year: 2001 };
    const sc: Candidate = {
      id: 5,
      title: "Amelie",
      year: 2001,
      type: "film",
    };
    expect(matchTitle(naka, [sc])).toEqual({ kind: "match", id: 5 });
  });

  it("matches across hyphens", () => {
    const naka: Titled = { title: "Spider-Man", type: "film", year: 2002 };
    const sc: Candidate = {
      id: 6,
      title: "Spider Man",
      year: 2002,
      type: "film",
    };
    expect(matchTitle(naka, [sc])).toEqual({ kind: "match", id: 6 });
  });
});

function film(id: number, title: string, year?: number): Candidate {
  return { id, title, year, type: "film" };
}

const heat: Titled = { title: "Heat", year: 2000, type: "film" };

describe("matchTitle year branches", () => {
  it("prefers the exact year over a candidate one year off", () => {
    const result = matchTitle(heat, [
      film(1, "Heat", 2001),
      film(2, "Heat", 2000),
    ]);
    expect(result).toEqual({ kind: "match", id: 2 });
  });

  it("is ambiguous when two candidates share the exact year", () => {
    const result = matchTitle(heat, [
      film(1, "Heat", 2000),
      film(2, "Heat", 2000),
    ]);
    expect(result).toEqual({ kind: "ambiguous", ids: [1, 2] });
  });

  it("prefers a near candidate over a far one", () => {
    const result = matchTitle(heat, [
      film(1, "Heat", 2010),
      film(2, "Heat", 2001),
    ]);
    expect(result).toEqual({ kind: "match", id: 2 });
  });

  it("is ambiguous with every title-equal id when two are near and none exact", () => {
    const result = matchTitle(heat, [
      film(1, "Heat", 1999),
      film(2, "Heat", 2001),
      film(3, "Heat", 2010),
    ]);
    expect(result).toEqual({ kind: "ambiguous", ids: [1, 2, 3] });
  });

  it("is ambiguous for a lone candidate when the Naka year is unknown", () => {
    const naka: Titled = { title: "Heat", type: "film" };
    expect(matchTitle(naka, [film(7, "Heat", 1995)])).toEqual({
      kind: "ambiguous",
      ids: [7],
    });
  });

  it("an unknown-year candidate is dropped when a near one exists (documented choice)", () => {
    const result = matchTitle(heat, [film(1, "Heat"), film(2, "Heat", 2001)]);
    expect(result).toEqual({ kind: "match", id: 2 });
  });
});

describe("matchTitle title equality", () => {
  it("matches the Naka title against the candidate original title", () => {
    const naka: Titled = { title: "Le Grinch", year: 2000, type: "film" };
    const candidate: Candidate = {
      ...film(1, "Something else", 2000),
      originalTitle: "Le Grinch",
    };
    expect(matchTitle(naka, [candidate])).toEqual({
      kind: "match",
      id: 1,
    });
  });

  it("matches the Naka original title against the candidate title", () => {
    const naka: Titled = {
      title: "Autre",
      originalTitle: "Heat",
      year: 2000,
      type: "film",
    };
    expect(matchTitle(naka, [film(1, "Heat", 2000)])).toEqual({
      kind: "match",
      id: 1,
    });
  });

  it("excludes a same-type candidate with a different title", () => {
    expect(matchTitle(heat, [film(1, "Collateral", 2000)])).toEqual({
      kind: "none",
    });
    const result = matchTitle(heat, [
      film(1, "Collateral", 2000),
      film(2, "Heat", 2000),
    ]);
    expect(result).toEqual({ kind: "match", id: 2 });
  });
});
