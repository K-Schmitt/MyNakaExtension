import { describe, expect, it } from "vitest";
import { PAGE_CHANNEL } from "../src/ext/messages";
import {
  ficheEvent,
  ficheRequest,
  seasonRequest,
} from "../src/page/fiche-observer";

const BROWSE = "https://naka.cx/api/v1/browse";
const TV_URL = `${BROWSE}/by-tmdb/tv/1434`;
const FILM_URL = `${BROWSE}/by-tmdb/movie/603`;

// Shaped like the content of the owner's probe of 2026-11-11 (key names from « Probe fiche » and « Probe 3 »).
const PROBE = {
  id: 21391,
  tmdbId: 1434,
  mediaType: "tv",
  title: "Les Griffin",
  originalTitle: "Family Guy",
  releaseDate: "1999-01-31",
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  numberOfSeasons: 23,
  overview: "…",
};

describe("ficheRequest", () => {
  it("is a GET of a title page's content, film or series", () => {
    expect(ficheRequest("GET", TV_URL)).toBe(true);
    expect(ficheRequest("get", FILM_URL)).toBe(true);
    expect(ficheRequest("GET", `${FILM_URL}?lang=fr`)).toBe(true);
  });

  it.each([
    ["a POST", "POST", TV_URL],
    ["another path", "GET", `${BROWSE}/21391`],
    ["a longer path", "GET", `${TV_URL}/similar`],
    ["an unknown type", "GET", `${BROWSE}/by-tmdb/anime/1434`],
    ["a tmdb id 0", "GET", `${BROWSE}/by-tmdb/tv/0`],
    ["a non-numeric id", "GET", `${BROWSE}/by-tmdb/tv/x1`],
    ["another site", "GET", "https://evil.example/api/v1/browse/by-tmdb/tv/1"],
  ])("%s is no title page request", (_name, method, url) => {
    expect(ficheRequest(method, url)).toBe(false);
  });
});

describe("ficheEvent", () => {
  it("reads the probe-shaped answer into a fiche event", () => {
    expect(ficheEvent(PROBE)).toEqual({
      channel: PAGE_CHANNEL,
      kind: "fiche",
      contentId: 21391,
      tmdbId: 1434,
      mediaType: "tv",
      title: "Les Griffin",
      originalTitle: "Family Guy",
      year: 1999,
    });
  });

  it("leaves out an absent original title and an unreadable release date", () => {
    const { originalTitle: _o, ...bare } = PROBE;
    const expected = {
      channel: PAGE_CHANNEL,
      kind: "fiche",
      contentId: 21391,
      tmdbId: 1434,
      mediaType: "tv",
      title: "Les Griffin",
    };
    for (const releaseDate of [undefined, null, "", "soon", "0999-01-01"]) {
      expect(ficheEvent({ ...bare, releaseDate })).toEqual(expected);
    }
    expect(ficheEvent({ ...bare, originalTitle: null })).toEqual({
      ...expected,
      year: 1999,
    });
  });

  it.each([
    ["a title of 201 characters", { ...PROBE, title: "x".repeat(201) }],
    ["no title", { ...PROBE, title: undefined }],
    ["no id", { ...PROBE, id: undefined }],
    ["a string tmdbId", { ...PROBE, tmdbId: "1434" }],
    ["an unknown media type", { ...PROBE, mediaType: "anime" }],
    ["an array", [PROBE]],
    ["null", null],
    ["a string", "Les Griffin"],
  ])("%s gives no event", (_name, answer) => {
    expect(ficheEvent(answer)).toBeUndefined();
  });

  it("a hostile getter gives no event", () => {
    const answer = { ...PROBE };
    Object.defineProperty(answer, "title", {
      get() {
        throw new Error("boom");
      },
    });
    expect(ficheEvent(answer)).toBeUndefined();
  });
});

describe("seasonRequest", () => {
  it("reads the content and the season from the url", () => {
    expect(seasonRequest("GET", `${BROWSE}/12/season/3`)).toEqual({
      channel: PAGE_CHANNEL,
      kind: "season",
      contentId: 12,
      season: 3,
    });
  });

  it.each([
    ["a POST", "POST", `${BROWSE}/12/season/3`],
    ["a season 0", "GET", `${BROWSE}/12/season/0`],
    ["a content 0", "GET", `${BROWSE}/0/season/3`],
    ["a longer path", "GET", `${BROWSE}/12/season/3/x`],
    ["the seasons list", "GET", `${BROWSE}/12/available-seasons`],
    ["a non-numeric season", "GET", `${BROWSE}/12/season/S3`],
    ["an unsafe id", "GET", `${BROWSE}/99999999999999999/season/3`],
    ["another site", "GET", "https://evil.example/api/v1/browse/12/season/3"],
  ])("%s is no season request", (_name, method, url) => {
    expect(seasonRequest(method, url)).toBeUndefined();
  });
});
