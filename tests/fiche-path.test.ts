import { describe, expect, it } from "vitest";
import { parseTitlePath } from "../src/content/fiche-path";

describe("the tab's title page address", () => {
  it("reads a film and a series with the largest safe tmdbId", () => {
    expect(parseTitlePath("/content/movie/9007199254740991")).toEqual({
      mediaType: "movie",
      tmdbId: 9007199254740991,
    });
    expect(parseTitlePath("/content/tv/42")).toEqual({
      mediaType: "tv",
      tmdbId: 42,
    });
  });

  it("follows no tmdbId above the safe integers", () => {
    expect(parseTitlePath("/content/movie/9007199254740992")).toBeUndefined();
    expect(parseTitlePath("/content/tv/99999999999999999999")).toBeUndefined();
  });
});
