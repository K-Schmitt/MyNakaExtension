import { describe, expect, it } from "vitest";
import {
  nakaToCandidate,
  nakaToTitled,
  scToCandidate,
  scToTitled,
} from "../src/core/adapt-titles";
import { resolveNakaIds } from "../src/core/resolver";
import { emptyState } from "../src/core/state";
import type { Candidate } from "../src/core/title-match";
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

  it.each([
    [5, "/serie/x/1"],
    [5, "/serie/widow_s_bay/99153120/S1"],
    [32, "/serie/dreamland/48034937"],
    [32, "/film/x/123"],
    [3, "/film/x/1"],
    [0, "/serie/x/1"],
  ])(
    "never makes a candidate of the numeric universe %j, whatever the url %j",
    (universe, url) => {
      const item = sc({ universe, url });
      expect(scToTitled(item)).toBeUndefined();
      expect(scToCandidate(item)).toBeUndefined();
    },
  );

  it("an episode product is never a series candidate", () => {
    const episode = sc({
      productId: 133353723,
      title: "Widow's Bay",
      url: "/serie/widow_s_bay/99153120/S1/E1",
      year: 2026,
      universe: 32,
    });
    expect(scToCandidate(episode)).toBeUndefined();
  });

  it("a Naka series is never mapped to an episode product", async () => {
    const products = [
      sc({
        productId: 133353723,
        title: "Widow's Bay",
        url: "/serie/widow_s_bay/99153120/S1/E1",
        year: 2026,
        universe: 32,
      }),
    ];
    const state = await resolveNakaIds([77], emptyState(), {
      describeNaka: async () => ({
        title: "Widow's Bay",
        year: 2026,
        type: "serie",
      }),
      searchSc: async () =>
        products.flatMap((item): Candidate[] => {
          const candidate = scToCandidate(item);
          return candidate ? [candidate] : [];
        }),
      describeSc: async () => undefined,
      searchNaka: async () => [],
    });
    expect(state.mapping).toEqual([]);
  });

  it.each([
    ["32", "/serie/widow_s_bay/99153120/S1/E1"],
    ["4", "/serie/x/1"],
    ["1", "/film/x/1"],
    ["", "/serie/x/1"],
  ])(
    "never makes a candidate of the present non-numeric universe %j, whatever the url %j",
    (universe, url) => {
      const item = sc({ universe, url });
      expect(scToTitled(item)).toBeUndefined();
      expect(scToCandidate(item)).toBeUndefined();
    },
  );

  it("falls back to the url prefix only when the universe is absent", () => {
    const { universe: _absent, ...bare } = sc();
    expect(scToTitled({ ...bare, url: "/serie/x/1" })?.type).toBe("serie");
    expect(scToTitled({ ...bare, url: "/film/x/1" })?.type).toBe("film");
    expect(scToTitled({ ...bare, url: "/jeuvideo/x/1" })).toBeUndefined();
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

describe("images through the adapters", () => {
  const image = { posterPath: "/a.jpg", picture: "https://x.example/p.jpg" };

  it("nakaToTitled and nakaToCandidate copy the image", () => {
    expect(nakaToTitled(naka({ image })).image).toEqual(image);
    expect(nakaToCandidate(naka({ image })).image).toEqual(image);
  });

  it("scToTitled and scToCandidate copy the image", () => {
    expect(scToTitled(sc({ image }))?.image).toEqual(image);
    expect(scToCandidate(sc({ image }))?.image).toEqual(image);
  });

  it("omit the key when the item has no image", () => {
    expect("image" in nakaToTitled(naka())).toBe(false);
    expect("image" in nakaToCandidate(naka())).toBe(false);
    expect("image" in (scToTitled(sc()) ?? {})).toBe(false);
    expect("image" in (scToCandidate(sc()) ?? {})).toBe(false);
  });
});
