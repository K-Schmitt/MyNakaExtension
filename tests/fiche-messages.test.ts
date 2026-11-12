import { describe, expect, it } from "vitest";
import {
  parseFicheInfo,
  parseLinkAnswer,
  parseMineAnswer,
  parseRateAnswer,
  parseSeasonAnswer,
} from "../src/ext/fiche-answers";
import { allowedFor, parseToWorker } from "../src/ext/messages";

const INFO = {
  type: "fiche-info",
  contentId: 5,
  mediaType: "tv",
  title: "Les Griffin",
  originalTitle: "Family Guy",
  year: 1999,
};
const SEASON = { type: "fiche-season", contentId: 5, season: 2 };
const MINE = { type: "fiche-mine", contentId: 5, productId: 77 };
const LINK = { type: "fiche-link", contentId: 5, productId: 77 };
const FILM = {
  type: "fiche-rate",
  contentId: 5,
  target: "film",
  productId: 77,
  rating: 8,
};
const EPISODE = { ...FILM, target: "épisode", season: 2, episode: 3 };
const VALID = [
  INFO,
  SEASON,
  MINE,
  LINK,
  FILM,
  { ...FILM, target: "série" },
  EPISODE,
];

describe("title page messages", () => {
  it("parses each valid message to itself", () => {
    for (const msg of VALID) expect(parseToWorker(msg)).toEqual(msg);
    const bare = { ...INFO, originalTitle: undefined, year: undefined };
    expect(parseToWorker(bare)).toEqual({
      type: "fiche-info",
      contentId: 5,
      mediaType: "tv",
      title: "Les Griffin",
    });
  });

  it.each([
    ["rating 0", { ...FILM, rating: 0 }],
    ["rating 11", { ...FILM, rating: 11 }],
    ["rating 7.5", { ...FILM, rating: 7.5 }],
    ["fractional product id", { ...FILM, productId: 1.5 }],
    ["fractional content id", { ...MINE, contentId: 2.5 }],
    ["zero id", { ...LINK, productId: 0 }],
    ["target saison", { ...FILM, target: "saison" }],
    ["épisode without place", { ...FILM, target: "épisode" }],
    ["épisode without episode", { ...EPISODE, episode: undefined }],
    ["épisode without season", { ...EPISODE, season: undefined }],
    ["film with a season", { ...FILM, season: 1 }],
    ["an extra key on info", { ...INFO, token: "t" }],
    ["an extra key on rate", { ...FILM, tmdbId: 1 }],
    ["an extra key on mine", { ...MINE, x: 1 }],
    ["an extra key on link", { ...LINK, x: 1 }],
    ["an extra key on season", { ...SEASON, x: 1 }],
    ["a 201 character title", { ...INFO, title: "x".repeat(201) }],
    ["a bad media type", { ...INFO, mediaType: "film" }],
    ["season 0", { ...SEASON, season: 0 }],
  ])("rejects %s", (_name, msg) => {
    expect(parseToWorker(msg)).toBeUndefined();
  });

  it("refuses a status-page sender, allows the Naka tab, for each type", () => {
    for (const raw of VALID) {
      const msg = parseToWorker(raw);
      if (msg === undefined) throw new Error("unparsed");
      expect(allowedFor("status-page", msg)).toBe(false);
      expect(allowedFor("naka-tab", msg)).toBe(true);
    }
  });
});

describe("title page answers", () => {
  const cand = { id: 9, title: "A", type: "serie" };

  it("reads a FicheInfo", () => {
    const info = {
      state: "linked",
      product: { id: 3, average: 7.4, mine: null },
    };
    expect(parseFicheInfo(info)).toEqual(info);
    const choose = { state: "choose", candidates: [cand] };
    expect(parseFicheInfo(choose)).toEqual(choose);
    expect(parseFicheInfo({ state: "notfound" })).toEqual({
      state: "notfound",
    });
  });

  it.each([
    { state: "other" },
    { state: "linked", token: "t" },
    { state: "linked", product: { id: 0, average: null, mine: null } },
    { state: "linked", product: { id: 1, average: 11, mine: null } },
    { state: "linked", product: { id: 1, average: null, mine: 0 } },
    { state: "linked", product: { id: 1, average: null } },
    { state: "choose", candidates: [{ ...cand, x: 1 }] },
    { state: "choose", candidates: Array.from({ length: 50 }, () => cand) },
    null,
  ])("rejects a bad FicheInfo %#", (raw) => {
    expect(() => parseFicheInfo(raw)).toThrow();
  });

  it("reads the season, mine, rate and link answers", () => {
    const season = { episodes: [{ episode: 1, productId: 4, average: null }] };
    expect(parseSeasonAnswer(season)).toEqual(season);
    expect(parseMineAnswer({ mine: 6 })).toEqual({ mine: 6 });
    expect(parseMineAnswer({ mine: null })).toEqual({ mine: null });
    expect(parseRateAnswer({ ok: true })).toEqual({ ok: true });
    expect(parseRateAnswer({ error: "sc-session" })).toEqual({
      error: "sc-session",
    });
    expect(parseLinkAnswer({ ok: true })).toEqual({ ok: true });
  });

  it.each([
    () =>
      parseSeasonAnswer({
        episodes: [{ episode: 0, productId: 4, average: null }],
      }),
    () => parseSeasonAnswer({ episodes: [{ episode: 1, productId: 4 }] }),
    () => parseSeasonAnswer({ episodes: [], x: 1 }),
    () => parseMineAnswer({ mine: 11 }),
    () => parseMineAnswer({}),
    () => parseRateAnswer({ error: "nope" }),
    () => parseRateAnswer({ ok: true, error: "sc-session" }),
    () => parseRateAnswer({ ok: false }),
    () => parseLinkAnswer({ ok: false }),
  ])("rejects a bad answer %#", (parse) => {
    expect(parse).toThrow();
  });
});
