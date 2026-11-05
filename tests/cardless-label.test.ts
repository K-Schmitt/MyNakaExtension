import { describe, expect, it } from "vitest";
import { cardlessLabel } from "../src/core/cardless-label";

describe("the label a title with no card can be rated on", () => {
  it("is the film without season and episode, the épisode with both", () => {
    expect(cardlessLabel({ contentId: 9 })).toBe("film");
    expect(cardlessLabel({ contentId: 5, season: 1, episode: 2 })).toBe(
      "épisode",
    );
  });

  it("is none with a season alone or an episode alone", () => {
    expect(cardlessLabel({ contentId: 5, season: 1 })).toBeUndefined();
    expect(cardlessLabel({ contentId: 5, episode: 2 })).toBeUndefined();
  });
});
