import { describe, expect, it } from "vitest";
import {
  findEpisode,
  parseSeasonEpisodes,
  parseSeasonProductId,
  seasonUrl,
} from "../src/sc/season-episodes";
import seasonHtml from "./fixtures/season-widow-s-bay-s1.html?raw";

const SERIES = 99153120;
const BASE = "/serie/widow_s_bay/99153120";
const EPISODES_KEY = 'episodes({"limit":50,"offset":0})';

function pageWith(state: unknown, scriptAttrs = ""): string {
  const data = { props: { pageProps: { __APOLLO_STATE__: state } } };
  return `<html><script id="__NEXT_DATA__" type="application/json"${scriptAttrs}>${JSON.stringify(data)}</script></html>`;
}

function product(id: number, url: string, title?: string): object {
  return {
    __typename: "Product",
    id,
    url,
    ...(title === undefined ? {} : { title }),
  };
}

function seasonEntry(id: number, url: string, refs: number[]): object {
  return {
    ...product(id, url),
    [EPISODES_KEY]: refs.map((ref) => ({ __ref: `Product:${ref}` })),
  };
}

describe("parseSeasonEpisodes on the real fixture", () => {
  const episodes = parseSeasonEpisodes(seasonHtml, SERIES, 1);

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

  it("lists episodes 1 to 10 in order", () => {
    expect(episodes.map((e) => e.episode)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("does not list the season entry as an episode", () => {
    expect(episodes.some((e) => e.productId === 133353713)).toBe(false);
  });

  it("gives nothing for another series id", () => {
    expect(parseSeasonEpisodes(seasonHtml, 1234, 1)).toEqual([]);
  });

  it("gives nothing for a season that is not on the page", () => {
    expect(parseSeasonEpisodes(seasonHtml, SERIES, 2)).toEqual([]);
  });
});

describe("parseSeasonProductId", () => {
  it("returns the season entry id", () => {
    expect(parseSeasonProductId(seasonHtml, SERIES, 1)).toBe(133353713);
  });

  it("returns undefined for a season that is not on the page", () => {
    expect(parseSeasonProductId(seasonHtml, SERIES, 2)).toBeUndefined();
  });

  it("returns undefined for another series id", () => {
    expect(parseSeasonProductId(seasonHtml, 1234, 1)).toBeUndefined();
  });

  it("does not take an episode url for a season", () => {
    const html = pageWith({ "Product:5": product(5, `${BASE}/S1/E1`) });
    expect(parseSeasonProductId(html, SERIES, 1)).toBeUndefined();
  });

  it("matches the season number exactly, not by prefix", () => {
    const html = pageWith({
      "Product:11": product(11, `${BASE}/S11`),
      "Product:1": product(1, `${BASE}/S1`),
    });
    expect(parseSeasonProductId(html, SERIES, 1)).toBe(1);
    expect(parseSeasonProductId(html, SERIES, 11)).toBe(11);
  });

  it("needs the slash before the season marker", () => {
    const html = pageWith({ "Product:1": product(1, `${BASE}/XS1`) });
    expect(parseSeasonProductId(html, SERIES, 1)).toBeUndefined();
  });

  it("ignores a foreign series placed before the real entry", () => {
    const html = pageWith({
      "Product:7": product(7, "/serie/other/5/S1"),
      "Product:1": product(1, `${BASE}/S1`),
    });
    expect(parseSeasonProductId(html, SERIES, 1)).toBe(1);
  });

  it("does not match a series id that only ends the same way", () => {
    const html = pageWith({
      "Product:7": product(7, "/serie/x/199153120/S1"),
    });
    expect(parseSeasonProductId(html, SERIES, 1)).toBeUndefined();
  });

  it("takes the first entry when two qualify", () => {
    const html = pageWith({
      "Product:3": product(3, `${BASE}/S1`),
      "Product:2": product(2, `/other/${SERIES}/S1`),
    });
    expect(parseSeasonProductId(html, SERIES, 1)).toBe(3);
  });

  it("matches nothing for a season that is not an integer", () => {
    expect(parseSeasonProductId(seasonHtml, SERIES, 1.5)).toBeUndefined();
    expect(
      parseSeasonProductId(seasonHtml, SERIES, Number.NaN),
    ).toBeUndefined();
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
      expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
      expect(parseSeasonProductId(html, SERIES, 1)).toBeUndefined();
    });
  }
});

describe("script tag", () => {
  it("still parses with an extra attribute", () => {
    const html = pageWith(
      { "Product:1": product(1, `${BASE}/S1`) },
      ' nonce="abc"',
    );
    expect(parseSeasonProductId(html, SERIES, 1)).toBe(1);
  });

  it("still parses when the id is not the first attribute", () => {
    const html = pageWith({ "Product:1": product(1, `${BASE}/S1`) }).replace(
      '<script id="__NEXT_DATA__" type="application/json"',
      '<script nonce="abc" id="__NEXT_DATA__"',
    );
    expect(parseSeasonProductId(html, SERIES, 1)).toBe(1);
  });
});

describe("parseSeasonEpisodes rules", () => {
  it("sorts by episode number whatever the list order", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [3, 1, 2]),
      "Product:3": product(3, `${BASE}/S1/E1`),
      "Product:1": product(1, `${BASE}/S1/E3`),
      "Product:2": product(2, `${BASE}/S1/E2`),
    });
    expect(
      parseSeasonEpisodes(html, SERIES, 1).map((e) => [e.episode, e.productId]),
    ).toEqual([
      [1, 3],
      [2, 2],
      [3, 1],
    ]);
  });

  it("sorts numerically, not as text", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1, 2]),
      "Product:1": product(1, `${BASE}/S1/E12`),
      "Product:2": product(2, `${BASE}/S1/E2`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1).map((e) => e.episode)).toEqual([
      2, 12,
    ]);
  });

  it("ignores a foreign series episode with the same numbers", () => {
    const html = pageWith({
      "Product:9": product(9, "/serie/other/7/S1/E5"),
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:1": product(1, `${BASE}/S1/E5`),
    });
    const episodes = parseSeasonEpisodes(html, SERIES, 1);
    expect(findEpisode(episodes, 1, 5)?.productId).toBe(1);
    expect(episodes).toHaveLength(1);
  });

  it("ignores an episode that is in the state but not in the season list", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:1": product(1, `${BASE}/S1/E1`),
      "Product:2": product(2, `${BASE}/S1/E2`),
    });
    expect(
      parseSeasonEpisodes(html, SERIES, 1).map((e) => e.productId),
    ).toEqual([1]);
  });

  it("skips a ref that points to another season", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1, 2]),
      "Product:1": product(1, `${BASE}/S1/E1`),
      "Product:2": product(2, `${BASE}/S2/E1`),
    });
    expect(
      parseSeasonEpisodes(html, SERIES, 1).map((e) => e.productId),
    ).toEqual([1]);
  });

  it("skips a ref that points to another series", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1, 2]),
      "Product:1": product(1, `${BASE}/S1/E1`),
      "Product:2": product(2, "/serie/other/7/S1/E2"),
    });
    expect(
      parseSeasonEpisodes(html, SERIES, 1).map((e) => e.productId),
    ).toEqual([1]);
  });

  it("does not take a series id that only ends the same way", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:1": product(1, "/serie/x/199153120/S1/E1"),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("skips a ref whose url has no episode number", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1, 2]),
      "Product:1": product(1, `${BASE}/S1`),
      "Product:2": product(2, `${BASE}/S1/E2`),
    });
    expect(
      parseSeasonEpisodes(html, SERIES, 1).map((e) => e.productId),
    ).toEqual([2]);
  });

  it("anchors the episode pattern to the end of the url", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:1": product(1, `${BASE}/S1/E1/critiques`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("needs digits after the E", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:1": product(1, `${BASE}/S1/Ex`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("gives nothing when the season entry has no episodes field", () => {
    const html = pageWith({
      "Product:10": product(10, `${BASE}/S1`),
      "Product:1": product(1, `${BASE}/S1/E1`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("only reads fields whose name starts with episodes(", () => {
    const html = pageWith({
      "Product:10": {
        ...product(10, `${BASE}/S1`),
        similar: [{ __ref: "Product:1" }],
      },
      "Product:1": product(1, `${BASE}/S1/E1`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("ignores an episodes field that is not a list", () => {
    const html = pageWith({
      "Product:10": { ...product(10, `${BASE}/S1`), [EPISODES_KEY]: "none" },
      "Product:1": product(1, `${BASE}/S1/E1`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("ignores list items that are not refs or point nowhere", () => {
    const html = pageWith({
      "Product:10": {
        ...product(10, `${BASE}/S1`),
        [EPISODES_KEY]: [
          null,
          "Product:1",
          { __ref: 5 },
          { __ref: "Product:404" },
          { __ref: "Person:1" },
          { __ref: "Product:2" },
        ],
      },
      "Person:1": product(1, `${BASE}/S1/E1`),
      "Product:2": product(2, `${BASE}/S1/E2`),
    });
    expect(
      parseSeasonEpisodes(html, SERIES, 1).map((e) => e.productId),
    ).toEqual([2]);
  });

  it("ignores a referenced entry without a numeric id or a string url", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1, 2, 3, 4]),
      "Product:1": { id: "1", url: `${BASE}/S1/E1` },
      "Product:2": { id: 2, url: 7 },
      "Product:3": null,
      "Product:4": { id: 4, url: [`${BASE}/S1/E4`] },
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("uses an empty title when the entry has none", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:1": product(1, `${BASE}/S1/E1`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)[0]?.title).toBe("");
  });

  it("uses an empty title when the title is not a string", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:1": { id: 1, url: `${BASE}/S1/E1`, title: 12 },
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)[0]?.title).toBe("");
  });

  it("de-duplicates a product listed twice", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1, 1]),
      "Product:1": product(1, `${BASE}/S1/E1`, "A"),
    });
    const episodes = parseSeasonEpisodes(html, SERIES, 1);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.title).toBe("A");
  });

  it("keeps the first entry when two refs resolve to the same product id", () => {
    const html = pageWith({
      "Product:10": {
        ...product(10, `${BASE}/S1`),
        [EPISODES_KEY]: [{ __ref: "Product:1" }, { __ref: "Product:1b" }],
      },
      "Product:1": product(1, `${BASE}/S1/E1`, "First"),
      "Product:1b": product(1, `${BASE}/S1/E1`, "Second"),
    });
    const episodes = parseSeasonEpisodes(html, SERIES, 1);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.title).toBe("First");
  });

  it("reads the episode number after the last /E, even with a slug starting with E", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `/serie/Eden/${SERIES}/S1`, [1]),
      "Product:1": product(1, `/serie/Eden/${SERIES}/S1/E3`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1).map((e) => e.episode)).toEqual([
      3,
    ]);
  });

  it("needs the episode number to be only digits", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:1": product(1, `${BASE}/S1/Ex12`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("ignores an episodes field that is an object or a number", () => {
    const html = pageWith({
      "Product:10": {
        ...product(10, `${BASE}/S1`),
        [EPISODES_KEY]: { __ref: "Product:1" },
        'episodes({"limit":10})': 5,
      },
      "Product:1": product(1, `${BASE}/S1/E1`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("reads another season of the same series when asked", () => {
    const html = pageWith({
      "Product:10": seasonEntry(10, `${BASE}/S1`, [1]),
      "Product:20": seasonEntry(20, `${BASE}/S2`, [2]),
      "Product:1": product(1, `${BASE}/S1/E1`),
      "Product:2": product(2, `${BASE}/S2/E1`),
    });
    expect(parseSeasonEpisodes(html, SERIES, 2)).toEqual([
      { productId: 2, season: 2, episode: 1, title: "" },
    ]);
  });

  it("gives nothing for a season that is not an integer", () => {
    expect(parseSeasonEpisodes(seasonHtml, SERIES, 1.5)).toEqual([]);
    expect(parseSeasonEpisodes(seasonHtml, SERIES, Number.NaN)).toEqual([]);
  });
});

describe("findEpisode", () => {
  const list = [
    { productId: 1, season: 1, episode: 1, title: "" },
    { productId: 2, season: 2, episode: 1, title: "" },
  ];

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

describe("locating the __NEXT_DATA__ tag", () => {
  const state = { "Product:1": product(1, `${BASE}/S1`) };
  const data = JSON.stringify({
    props: { pageProps: { __APOLLO_STATE__: state } },
  });

  it.each([
    ["a space", " "],
    ["a tab", "\t"],
    ["a newline", "\n"],
  ])("accepts the id after %s", (_n, gap) => {
    const html = `<script${gap}id="__NEXT_DATA__">${data}</script>`;
    expect(parseSeasonProductId(html, SERIES, 1)).toBe(1);
  });

  it.each([
    ["data-id", `<script data-id="__NEXT_DATA__">${data}</script>`],
    ["x-id", `<script x-id="__NEXT_DATA__">${data}</script>`],
    ["a longer id value", `<script id="x__NEXT_DATA__">${data}</script>`],
    ["no script tag", `<div id="__NEXT_DATA__">${data}</script>`],
  ])("does not take %s for the tag", (_n, html) => {
    expect(parseSeasonProductId(html, SERIES, 1)).toBeUndefined();
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
  });

  it("needs the id inside the script tag, not after it", () => {
    const html = `<script>${data}</script> id="__NEXT_DATA__">`;
    expect(parseSeasonProductId(html, SERIES, 1)).toBeUndefined();
  });

  it("stops at the first </script> after the tag", () => {
    const html = `<script id="__NEXT_DATA__">${data}</script><script>{"x":1}</script>`;
    expect(parseSeasonProductId(html, SERIES, 1)).toBe(1);
  });

  it("finds the tag even when '>' appears in a later attribute value", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${data}</script>`;
    expect(parseSeasonProductId(html, SERIES, 1)).toBe(1);
  });

  it("returns nothing when the tag never ends or the script never closes", () => {
    expect(
      parseSeasonProductId('<script id="__NEXT_DATA__"', SERIES, 1),
    ).toBeUndefined();
    expect(
      parseSeasonProductId(`<script id="__NEXT_DATA__">${data} `, SERIES, 1),
    ).toBeUndefined();
  });

  it.each([
    ["1 MB of '<script ' with no '>'", "<script ".repeat(131_072)],
    [
      "1 MB of unterminated tagged scripts",
      '<script id="__NEXT_DATA__" '.repeat(36_000),
    ],
    ["1 MB of ids with no script", ' id="__NEXT_DATA__"'.repeat(55_000)],
  ])("stays linear on %s", (_n, html) => {
    const started = performance.now();
    expect(parseSeasonProductId(html, SERIES, 1)).toBeUndefined();
    expect(parseSeasonEpisodes(html, SERIES, 1)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
