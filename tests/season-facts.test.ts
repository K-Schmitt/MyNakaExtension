import { describe, expect, it } from "vitest";
import { seasonFactsOf } from "../src/core/season-facts";

const GAP = { seasons: [1, 2, 4], episodeCounts: { 1: 16, 2: 25, 4: 8 } };

describe("seasonFactsOf", () => {
  it("takes the count of the season played and the highest season", () => {
    expect(seasonFactsOf(GAP, 2, 9)).toEqual({
      episodesInSeason: 25,
      lastSeason: 4,
    });
  });

  it("does not take the count of another season", () => {
    expect(seasonFactsOf(GAP, 1, undefined).episodesInSeason).toBe(16);
    expect(seasonFactsOf(GAP, 4, undefined).episodesInSeason).toBe(8);
  });

  it("takes the highest season, not the number of seasons", () => {
    expect(seasonFactsOf(GAP, 1, undefined).lastSeason).toBe(4);
  });

  it("takes the highest season wherever it stands in the list", () => {
    const shuffled = { seasons: [3, 7, 1], episodeCounts: {} };
    expect(seasonFactsOf(shuffled, 1, undefined).lastSeason).toBe(7);
  });

  it("takes the highest season of a list too long to spread", () => {
    const seasons = Array.from({ length: 300_000 }, (_, i) => i + 1);
    const long = { seasons, episodeCounts: { 1: 10 } };
    expect(seasonFactsOf(long, 1, undefined)).toEqual({
      episodesInSeason: 10,
      lastSeason: 300_000,
    });
  });

  it("leaves the count out when the played season has none", () => {
    const facts = seasonFactsOf(GAP, 3, undefined);
    expect(facts.episodesInSeason).toBeUndefined();
    expect(facts.lastSeason).toBe(4);
  });

  it("keeps Naka's numberOfSeasons when the list is missing", () => {
    expect(seasonFactsOf(undefined, 2, 5)).toEqual({ lastSeason: 5 });
    expect(seasonFactsOf(undefined, 2, undefined)).toEqual({
      lastSeason: undefined,
    });
  });

  it("prefers the list over numberOfSeasons", () => {
    expect(seasonFactsOf(GAP, 1, 2).lastSeason).toBe(4);
  });
});
