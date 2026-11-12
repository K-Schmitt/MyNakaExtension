import { describe, expect, it } from "vitest";
import { PAGE_CHANNEL, parsePageEvent } from "../src/ext/messages";

const CH = PAGE_CHANNEL;
const fiche = {
  channel: CH,
  kind: "fiche",
  contentId: 21391,
  tmdbId: 1434,
  mediaType: "tv",
  title: "Les Griffin",
};
const season = { channel: CH, kind: "season", contentId: 12, season: 3 };

describe("fiche page event", () => {
  it("accepts a title page, with or without its original title and year", () => {
    const full = { ...fiche, originalTitle: "Family Guy", year: 1999 };
    expect(parsePageEvent(full)).toEqual(full);
    expect(parsePageEvent(fiche)).toEqual(fiche);
    expect(parsePageEvent({ ...fiche, mediaType: "movie" })?.kind).toBe(
      "fiche",
    );
  });

  it("accepts the bounds: 1 and 200 characters, years 1800 and 2100", () => {
    const long = "é".repeat(200);
    for (const raw of [
      { ...fiche, title: "x", originalTitle: long, year: 1800 },
      { ...fiche, title: long, originalTitle: "x", year: 2100 },
    ]) {
      expect(parsePageEvent(raw)).toEqual(raw);
    }
  });

  it.each([
    ["an extra key", { ...fiche, token: "t" }],
    ["no title", { ...fiche, title: undefined }],
    ["an empty title", { ...fiche, title: "" }],
    ["a title of 201 characters", { ...fiche, title: "x".repeat(201) }],
    ["a number title", { ...fiche, title: 42 }],
    ["an empty original title", { ...fiche, originalTitle: "" }],
    ["an original title of 201", { ...fiche, originalTitle: "x".repeat(201) }],
    ["a year 1799", { ...fiche, year: 1799 }],
    ["a year 2101", { ...fiche, year: 2101 }],
    ["a fractional year", { ...fiche, year: 1999.5 }],
    ["a string year", { ...fiche, year: "1999" }],
    ["an unknown media type", { ...fiche, mediaType: "anime" }],
    ["a zero contentId", { ...fiche, contentId: 0 }],
    ["a fractional tmdbId", { ...fiche, tmdbId: 1.5 }],
    ["an unsafe tmdbId", { ...fiche, tmdbId: Number.MAX_SAFE_INTEGER + 2 }],
    ["a string contentId", { ...fiche, contentId: "21391" }],
  ])("rejects %s", (_name, raw) => {
    expect(parsePageEvent(raw)).toBeUndefined();
  });
});

describe("season page event", () => {
  it("accepts a season of a content", () => {
    expect(parsePageEvent(season)).toEqual(season);
  });

  it.each([
    ["an extra key", { ...season, episode: 1 }],
    ["no season", { channel: CH, kind: "season", contentId: 12 }],
    ["a season 0", { ...season, season: 0 }],
    ["a fractional season", { ...season, season: 1.5 }],
    ["no contentId", { channel: CH, kind: "season", season: 3 }],
    ["a negative contentId", { ...season, contentId: -12 }],
  ])("rejects %s", (_name, raw) => {
    expect(parsePageEvent(raw)).toBeUndefined();
  });
});
