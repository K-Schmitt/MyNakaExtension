import { describe, expect, it } from "vitest";
import {
  findEpisode,
  parseSeasonEpisodes,
  parseSeasonProductId,
  seasonUrl,
} from "../src/sc/season-episodes";
import seasonHtml from "./fixtures/season-widow-s-bay-s1.html?raw";

function pageWith(state: unknown): string {
  const data = { props: { pageProps: { __APOLLO_STATE__: state } } };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

function product(id: number, url: string, title?: string): object {
  return {
    __typename: "Product",
    id,
    url,
    ...(title === undefined ? {} : { title }),
  };
}

describe("parseSeasonEpisodes on the real fixture", () => {
  const episodes = parseSeasonEpisodes(seasonHtml);

  it("finds the ten episodes of season 1", () => {
    expect(episodes).toHaveLength(10);
  });

  it("reads the numbers from the url, not from the id order", () => {
    expect(findEpisode(episodes, 1, 1)?.productId).toBe(133353723);
    expect(findEpisode(episodes, 1, 5)?.productId).toBe(133353719);
    expect(findEpisode(episodes, 1, 10)?.productId).toBe(133353714);
  });

  it("returns the title and the numbers", () => {
    expect(findEpisode(episodes, 1, 2)).toEqual({
      productId: 133353722,
      season: 1,
      episode: 2,
      title: "Hébergement",
    });
  });

  it("sorts by episode even though ids descend", () => {
    expect(episodes.map((e) => e.episode)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("does not list the season entry as an episode", () => {
    expect(episodes.some((e) => e.productId === 133353713)).toBe(false);
  });
});

describe("parseSeasonProductId", () => {
  it("returns the season entry id", () => {
    expect(parseSeasonProductId(seasonHtml, 1)).toBe(133353713);
  });

  it("returns undefined for a season that is not on the page", () => {
    expect(parseSeasonProductId(seasonHtml, 2)).toBeUndefined();
  });

  it("does not take an episode url for a season", () => {
    const html = pageWith({ "Product:5": product(5, "/serie/a/1/S1/E1") });
    expect(parseSeasonProductId(html, 1)).toBeUndefined();
  });

  it("matches the season number exactly, not by prefix", () => {
    const html = pageWith({
      "Product:11": product(11, "/serie/a/1/S11"),
      "Product:1": product(1, "/serie/a/1/S1"),
    });
    expect(parseSeasonProductId(html, 1)).toBe(1);
    expect(parseSeasonProductId(html, 11)).toBe(11);
  });

  it("needs the slash before the season marker", () => {
    const html = pageWith({ "Product:1": product(1, "/serie/a/1/XS1") });
    expect(parseSeasonProductId(html, 1)).toBeUndefined();
  });
});

describe("unreadable pages", () => {
  const broken = [
    ["no tag", "<html><body>nothing</body></html>"],
    [
      "invalid json",
      '<script id="__NEXT_DATA__" type="application/json">{not json</script>',
    ],
    [
      "unexpected shape",
      '<script id="__NEXT_DATA__" type="application/json">{"props":42}</script>',
    ],
    [
      "null props",
      '<script id="__NEXT_DATA__" type="application/json">{"props":null}</script>',
    ],
    [
      "null pageProps",
      '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":null}}</script>',
    ],
    [
      "null apollo state",
      '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"__APOLLO_STATE__":null}}}</script>',
    ],
    [
      "json null",
      '<script id="__NEXT_DATA__" type="application/json">null</script>',
    ],
  ] as const;

  for (const [name, html] of broken) {
    it(`gives nothing for ${name}`, () => {
      expect(parseSeasonEpisodes(html)).toEqual([]);
      expect(parseSeasonProductId(html, 1)).toBeUndefined();
    });
  }
});

describe("parseSeasonEpisodes rules", () => {
  it("skips a product whose url has no season and episode", () => {
    const html = pageWith({
      "Product:1": product(1, "/film/x/9", "Film"),
      "Product:2": product(2, "/serie/a/1/S1/E1", "Ok"),
    });
    expect(parseSeasonEpisodes(html).map((e) => e.productId)).toEqual([2]);
  });

  it("anchors the pattern to the end of the url", () => {
    const html = pageWith({
      "Product:1": product(1, "/serie/a/1/S1/E1/critiques"),
    });
    expect(parseSeasonEpisodes(html)).toEqual([]);
  });

  it("ignores keys that are not Product entries", () => {
    const html = pageWith({
      "Person:1": product(1, "/serie/a/1/S1/E1"),
    });
    expect(parseSeasonEpisodes(html)).toEqual([]);
  });

  it("ignores entries without a numeric id or a string url", () => {
    const html = pageWith({
      "Product:1": { id: "1", url: "/serie/a/1/S1/E1" },
      "Product:2": { id: 2, url: 7 },
      "Product:5": { id: 5, url: ["/serie/a/1/S1/E1"] },
      "Product:3": null,
      "Product:4": "text",
    });
    expect(parseSeasonEpisodes(html)).toEqual([]);
  });

  it("uses an empty title when the entry has none", () => {
    const html = pageWith({ "Product:1": product(1, "/serie/a/1/S1/E1") });
    expect(parseSeasonEpisodes(html)[0]?.title).toBe("");
  });

  it("uses an empty title when the title is not a string", () => {
    const html = pageWith({
      "Product:1": { id: 1, url: "/serie/a/1/S1/E1", title: 12 },
    });
    expect(parseSeasonEpisodes(html)[0]?.title).toBe("");
  });

  it("de-duplicates by product id", () => {
    const html = pageWith({
      "Product:1": product(1, "/serie/a/1/S1/E1", "A"),
      "Product:1b": product(1, "/serie/a/1/S1/E1", "A again"),
    });
    const episodes = parseSeasonEpisodes(html);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.title).toBe("A");
  });

  it("keeps an episode of another season and sorts season first", () => {
    const html = pageWith({
      "Product:1": product(1, "/serie/a/1/S2/E1"),
      "Product:2": product(2, "/serie/a/1/S1/E12"),
      "Product:3": product(3, "/serie/a/1/S1/E2"),
    });
    expect(parseSeasonEpisodes(html).map((e) => [e.season, e.episode])).toEqual(
      [
        [1, 2],
        [1, 12],
        [2, 1],
      ],
    );
  });

  it("skips a season-only url", () => {
    const html = pageWith({ "Product:1": product(1, "/serie/a/1/S1") });
    expect(parseSeasonEpisodes(html)).toEqual([]);
  });
});

describe("findEpisode", () => {
  const list = parseSeasonEpisodes(
    pageWith({
      "Product:1": product(1, "/serie/a/1/S1/E1"),
      "Product:2": product(2, "/serie/a/1/S2/E1"),
    }),
  );

  it("matches on both season and episode", () => {
    expect(findEpisode(list, 2, 1)?.productId).toBe(2);
    expect(findEpisode(list, 1, 1)?.productId).toBe(1);
  });

  it("returns undefined when absent", () => {
    expect(findEpisode(list, 3, 1)).toBeUndefined();
    expect(findEpisode(list, 1, 2)).toBeUndefined();
  });
});

describe("seasonUrl", () => {
  it("builds the slug-free url", () => {
    expect(seasonUrl(99153120, 2)).toBe(
      "https://www.senscritique.com/serie/x/99153120/S2",
    );
  });
});
