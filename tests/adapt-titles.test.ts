import { describe, expect, it } from "vitest";
import {
  nakaToCandidate,
  nakaToTitled,
  scToCandidate,
  scToTitled,
} from "../src/core/adapt-titles";
import type { NakaItem } from "../src/naka/naka-items";
import type { ScWishItem } from "../src/sc/wishlist-page";

function naka(extra: Partial<NakaItem> = {}): NakaItem {
  return {
    contentId: 7,
    tmdbId: 99,
    mediaType: "tv",
    title: "Lost",
    ...extra,
  };
}

function sc(extra: Partial<ScWishItem> = {}): ScWishItem {
  return {
    productId: 12,
    title: "Dreamland",
    url: "/serie/dreamland/12",
    universe: 4,
    ...extra,
  };
}

describe("nakaToTitled", () => {
  it("maps tv to serie with the year of the release date", () => {
    expect(nakaToTitled(naka({ releaseDate: "2004-09-11" }))).toEqual({
      title: "Lost",
      type: "serie",
      year: 2004,
    });
  });

  it("maps movie to film", () => {
    expect(nakaToTitled(naka({ mediaType: "movie" })).type).toBe("film");
  });

  it.each([
    "",
    "abc",
    "0999-01-01",
    "1799-12-31",
    "2101-01-01",
    "20x4-01-01",
    "2e03-01-01",
  ])("has no year key for release date %j", (releaseDate) => {
    expect("year" in nakaToTitled(naka({ releaseDate }))).toBe(false);
  });

  it("accepts the year bounds", () => {
    expect(nakaToTitled(naka({ releaseDate: "1800-01-01" })).year).toBe(1800);
    expect(nakaToTitled(naka({ releaseDate: "2100-12-31" })).year).toBe(2100);
  });

  it("has no year key without a release date", () => {
    expect("year" in nakaToTitled(naka())).toBe(false);
  });

  it("carries originalTitle only when non-empty", () => {
    expect(nakaToTitled(naka({ originalTitle: "Lost!" })).originalTitle).toBe(
      "Lost!",
    );
    expect("originalTitle" in nakaToTitled(naka())).toBe(false);
    expect("originalTitle" in nakaToTitled(naka({ originalTitle: "" }))).toBe(
      false,
    );
  });

  it("copies nothing else and keeps the title as given", () => {
    const result = nakaToTitled(
      naka({ title: "  Lost ", originalTitle: "X", releaseDate: "2004-01-01" }),
    );
    expect(Object.keys(result).sort()).toEqual([
      "originalTitle",
      "title",
      "type",
      "year",
    ]);
    expect(result.title).toBe("  Lost ");
  });

  it("does not mutate a frozen input", () => {
    expect(() =>
      nakaToTitled(Object.freeze(naka({ releaseDate: "2004-01-01" }))),
    ).not.toThrow();
  });
});

describe("nakaToCandidate", () => {
  it("uses contentId as id and nothing else extra", () => {
    const result = nakaToCandidate(naka());
    expect(result.id).toBe(7);
    expect(Object.keys(result).sort()).toEqual(["id", "title", "type"]);
  });
});

describe("scToTitled", () => {
  it("maps universe 4 to serie and 1 to film whatever the url", () => {
    expect(scToTitled(sc({ universe: 4, url: "/film/x/1" }))?.type).toBe(
      "serie",
    );
    expect(scToTitled(sc({ universe: 1, url: "/serie/x/1" }))?.type).toBe(
      "film",
    );
    expect(scToTitled(sc({ universe: 1, url: "/jeuvideo/x/1" }))?.type).toBe(
      "film",
    );
  });

  it("falls back to the url prefix for other universes", () => {
    expect(
      scToTitled(sc({ universe: 32, url: "/serie/dreamland/48034937" }))?.type,
    ).toBe("serie");
    expect(scToTitled(sc({ universe: 5, url: "/serie/x/1" }))?.type).toBe(
      "serie",
    );
    expect(scToTitled(sc({ universe: 32, url: "/film/x/123" }))?.type).toBe(
      "film",
    );
    expect(scToTitled(sc({ universe: "", url: "/serie/x/1" }))?.type).toBe(
      "serie",
    );
    expect(scToTitled(sc({ universe: "1", url: "/film/x/1" }))?.type).toBe(
      "film",
    );
  });

  it.each([
    [3, "/jeuvideo/x/1"],
    [99, "/livre/x/1"],
    [99, "/series/x/1"],
    [99, "/filmography/x"],
    [99, "x/film/y"],
    [99, "x/serie/y"],
    [99, " /film/x/1"],
    [99, ""],
    ["", "/film"],
  ])("rejects universe %j with url %j", (universe, url) => {
    const item = sc({ universe, url });
    expect(scToTitled(item)).toBeUndefined();
    expect(scToCandidate(item)).toBeUndefined();
  });

  it("carries year and originalTitle only when present", () => {
    const full = scToTitled(sc({ year: 2020, originalTitle: "Dream" }));
    expect(full).toEqual({
      title: "Dreamland",
      originalTitle: "Dream",
      year: 2020,
      type: "serie",
    });
    const bare = scToTitled(sc());
    expect(bare && "year" in bare).toBe(false);
    expect(bare && "originalTitle" in bare).toBe(false);
    const empty = scToTitled(sc({ originalTitle: "" }));
    expect(empty && "originalTitle" in empty).toBe(false);
  });

  it("keeps the title as given and copies no other field", () => {
    const result = scToTitled(sc({ title: " Dreamland  " }));
    expect(result?.title).toBe(" Dreamland  ");
    expect(Object.keys(result ?? {}).sort()).toEqual(["title", "type"]);
  });

  it("does not mutate a frozen input", () => {
    expect(() => scToTitled(Object.freeze(sc({ year: 2000 })))).not.toThrow();
    expect(() =>
      scToCandidate(Object.freeze(sc({ year: 2000 }))),
    ).not.toThrow();
  });
});

describe("scToCandidate", () => {
  it("uses productId as id", () => {
    const result = scToCandidate(sc({ year: 2020 }));
    expect(result?.id).toBe(12);
    expect(Object.keys(result ?? {}).sort()).toEqual([
      "id",
      "title",
      "type",
      "year",
    ]);
  });
});
