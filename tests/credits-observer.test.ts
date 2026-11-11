import { describe, expect, it } from "vitest";
import { PAGE_CHANNEL } from "../src/ext/messages";
import { creditsEvent, creditsRequest } from "../src/page/credits-observer";

const SEGMENTS = "https://naka.cx/api/v1/skip-segments";
const EPISODE_URL = `${SEGMENTS}?tmdbId=1434&type=tv&season=23&episode=17`;
const FILM_URL = `${SEGMENTS}?tmdbId=603&type=movie`;

// The owner's probe of 2026-11-11.
const PROBE = {
  hit: true,
  segments: {
    intro: [{ endMs: 34868, startMs: null }],
    recap: [],
    credits: [{ endMs: null, startMs: 1221305 }],
    preview: [],
  },
};

const withCredits = (credits: unknown, hit: unknown = true) => ({
  hit,
  segments: { ...PROBE.segments, credits },
});

describe("creditsRequest", () => {
  it("reads the season and episode of a tv request, never the tmdbId", () => {
    expect(creditsRequest("GET", EPISODE_URL)).toEqual({
      season: 23,
      episode: 17,
    });
  });

  it("a film request names no season or episode", () => {
    expect(creditsRequest("GET", FILM_URL)).toEqual({});
    expect(creditsRequest("get", `${FILM_URL}&season=1&episode=2`)).toEqual({});
  });

  it.each([
    ["a POST", "POST", EPISODE_URL],
    ["a PUT", "PUT", EPISODE_URL],
    ["another path", "GET", `${SEGMENTS}/x?type=movie`],
    ["a look-alike path", "GET", `${SEGMENTS}s?type=movie`],
    [
      "another site",
      "GET",
      "https://evil.example/api/v1/skip-segments?type=movie",
    ],
    ["no type", "GET", `${SEGMENTS}?tmdbId=1`],
    ["an unknown type", "GET", `${SEGMENTS}?type=anime&season=1&episode=1`],
    ["a tv request without episode", "GET", `${SEGMENTS}?type=tv&season=1`],
    ["a season 0", "GET", `${SEGMENTS}?type=tv&season=0&episode=1`],
    ["an episode 1.5", "GET", `${SEGMENTS}?type=tv&season=1&episode=1.5`],
    ["a repeated episode", "GET", `${EPISODE_URL}&episode=18`],
    ["a repeated type", "GET", `${FILM_URL}&type=tv`],
  ])("%s is no credits request", (_name, method, url) => {
    expect(creditsRequest(method, url)).toBeUndefined();
  });
});

describe("creditsEvent", () => {
  it("the probe's answer gives the credits start of that episode", () => {
    expect(creditsEvent({ season: 23, episode: 17 }, PROBE)).toEqual({
      channel: PAGE_CHANNEL,
      kind: "credits",
      startMs: 1221305,
      season: 23,
      episode: 17,
    });
  });

  it("a film's answer gives no season or episode", () => {
    expect(creditsEvent({}, PROBE)).toEqual({
      channel: PAGE_CHANNEL,
      kind: "credits",
      startMs: 1221305,
    });
  });

  it.each([
    ["hit false", withCredits([{ startMs: 1221305 }], false)],
    ["no hit", { segments: PROBE.segments }],
    ["empty credits", withCredits([])],
    ["no credits", { hit: true, segments: { intro: [] } }],
    ["no segments", { hit: true }],
    ["a null start", withCredits([{ endMs: 5, startMs: null }])],
    ["a zero start", withCredits([{ startMs: 0 }])],
    ["a negative start", withCredits([{ startMs: -5 }])],
    ["a fractional start", withCredits([{ startMs: 1.5 }])],
    ["a string start", withCredits([{ startMs: "1221305" }])],
    ["a start of 24 h", withCredits([{ startMs: 86_400_000 }])],
    ["credits not a list", withCredits({ startMs: 1221305 })],
    ["a null answer", null],
    ["a list answer", [PROBE]],
    ["a string answer", "x"],
  ])("%s gives no event", (_name, answer) => {
    expect(creditsEvent({ season: 23, episode: 17 }, answer)).toBeUndefined();
  });

  it("a hostile answer gives no event and never throws", () => {
    const hostile = {
      hit: true,
      get segments(): unknown {
        throw new Error("boom");
      },
    };
    expect(creditsEvent({}, hostile)).toBeUndefined();
  });
});
