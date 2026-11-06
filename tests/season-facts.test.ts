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

describe("seasonFactsOf with Naka's announced episode count", () => {
  const AIRING = { seasons: [1], episodeCounts: { 1: 7 } };

  it("gives the unreleased episodes to the last season (VisionQuest: 7 released of 8)", () => {
    expect(seasonFactsOf(AIRING, 1, 1, 8)).toEqual({
      episodesInSeason: 8,
      lastSeason: 1,
    });
  });

  it("leaves an earlier season as Naka counts it", () => {
    // 16 + 25 + 8 released, 52 announced: the 3 missing ones are season 4's.
    expect(seasonFactsOf(GAP, 2, undefined, 52).episodesInSeason).toBe(25);
    expect(seasonFactsOf(GAP, 4, undefined, 52).episodesInSeason).toBe(11);
  });

  it("changes nothing when the announced count equals the released ones (a finished series)", () => {
    expect(seasonFactsOf(AIRING, 1, 1, 7).episodesInSeason).toBe(7);
  });

  it("ignores an announced count below the released ones", () => {
    expect(seasonFactsOf(AIRING, 1, 1, 5).episodesInSeason).toBe(7);
  });

  it("changes nothing without an announced count", () => {
    expect(seasonFactsOf(AIRING, 1, 1, undefined).episodesInSeason).toBe(7);
  });

  it("adds nothing when the catalogue announces a season the list lacks", () => {
    // Seasons 1 and 2 listed, 3 announced: the 3 missing episodes are season 3's, not season 2's.
    const unlisted = { seasons: [1, 2], episodeCounts: { 1: 10, 2: 10 } };
    expect(seasonFactsOf(unlisted, 2, 3, 23).episodesInSeason).toBe(10);
    expect(seasonFactsOf(unlisted, 2, 2, 23).episodesInSeason).toBe(13);
  });

  it("keeps a finished series open when Naka lacks an older episode (known limit)", () => {
    // Naka misses one episode of season 1: the gap cannot be told from an unreleased one.
    const shortfall = { seasons: [1, 2], episodeCounts: { 1: 15, 2: 24 } };
    expect(seasonFactsOf(shortfall, 2, 2, 40).episodesInSeason).toBe(25);
  });

  it("does not invent a count for a last season Naka gives none", () => {
    const missing = { seasons: [1, 2], episodeCounts: { 1: 10 } };
    expect(seasonFactsOf(missing, 2, 2, 20).episodesInSeason).toBeUndefined();
  });
});
