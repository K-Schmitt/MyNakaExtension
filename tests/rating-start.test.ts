import { describe, expect, it } from "vitest";
import type { RatingCard } from "../src/core/rating-cards";
import { startValue } from "../src/core/rating-start";
import { episodeCard, filmCard } from "./rating-fixtures";

function ep(
  episode: number,
  rating: number | undefined,
  over: Partial<RatingCard> = {},
): RatingCard {
  return episodeCard({
    key: `tv:5:S1E${episode}`,
    episode,
    given: rating === undefined ? {} : { épisode: rating },
    ...over,
  });
}

describe("startValue for a season", () => {
  it("rounds 7.5 up to 8", () => {
    const cards = [ep(1, 7), ep(2, 8)];
    expect(startValue(cards, ep(2, 8), "saison")).toBe(8);
  });
  it("rounds 6.67 to 7, not by truncation", () => {
    const cards = [ep(1, 6), ep(2, 7), ep(3, 7)];
    expect(startValue(cards, ep(3, 7), "saison")).toBe(7);
  });
  it("rounds 6.33 down to 6", () => {
    const cards = [ep(1, 6), ep(2, 6), ep(3, 7)];
    expect(startValue(cards, ep(3, 7), "saison")).toBe(6);
  });
  it("gives undefined with no episode rating", () => {
    const cards = [ep(1, undefined), ep(2, undefined)];
    expect(startValue(cards, ep(2, undefined), "saison")).toBeUndefined();
  });
  it("does not count another season", () => {
    const other = ep(1, 10, { key: "tv:5:S2E1", season: 2 });
    const cards = [ep(1, 6), other];
    expect(startValue(cards, ep(1, 6), "saison")).toBe(6);
  });
  it("does not count another series", () => {
    const other = ep(1, 10, { key: "tv:6:S1E1", contentId: 6 });
    const cards = [ep(1, 6), other];
    expect(startValue(cards, ep(1, 6), "saison")).toBe(6);
  });
});

describe("startValue for a series", () => {
  function season(n: number, rating: number, over: Partial<RatingCard> = {}) {
    return episodeCard({
      key: `tv:5:S${n}E9`,
      season: n,
      episode: 9,
      given: { saison: rating },
      ...over,
    });
  }
  it("rounds 8.5 up to 9", () => {
    const cards = [season(1, 8), season(2, 9)];
    expect(startValue(cards, season(2, 9), "série")).toBe(9);
  });
  it("does not count another series", () => {
    const other = season(1, 1, { key: "tv:6:S1E9", contentId: 6 });
    const cards = [season(1, 8), other];
    expect(startValue(cards, season(1, 8), "série")).toBe(8);
  });
  it("counts the season ratings, not the episode ratings", () => {
    const cards = [ep(1, 2), season(1, 8)];
    expect(startValue(cards, season(1, 8), "série")).toBe(8);
  });
  it("gives undefined with no season rating", () => {
    expect(startValue([ep(1, 5)], ep(1, 5), "série")).toBeUndefined();
  });
});

describe("startValue for the other labels", () => {
  it("gives undefined for an episode or a film", () => {
    const card = ep(1, 7);
    expect(startValue([card], card, "épisode")).toBeUndefined();
    const film = filmCard({ given: { film: 7 } });
    expect(startValue([film], film, "film")).toBeUndefined();
  });
});
