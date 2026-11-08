import { describe, expect, it } from "vitest";
import type { FinishEvent } from "../src/core/finish-event";
import { buildCard, type CardInput } from "../src/sw/rating-card-builder";

const EVENT: FinishEvent = {
  source: "explicit",
  progress: 1,
  naka: { contentId: 9, mediaType: "movie" },
  titled: { title: "Un film", type: "film" },
};

function input(item: CardInput["item"]): CardInput {
  return {
    outcome: {
      kind: "done",
      ratingTargets: [{ label: "film", productId: 3, current: null }],
    },
    event: EVENT,
    item,
    productState: () => Promise.reject(new Error("unused")),
    at: 5,
  };
}

const ITEM = {
  contentId: 9,
  tmdbId: 1,
  mediaType: "movie" as const,
  title: "Un film",
};

describe("buildCard images", () => {
  it("carries the image of the item", async () => {
    const image = { posterPath: "/a.jpg" };
    const card = await buildCard(input({ ...ITEM, image }));
    expect(card.image).toEqual(image);
  });

  it("leaves the key out when the item has none", async () => {
    const card = await buildCard(input(ITEM));
    expect("image" in card).toBe(false);
  });
});
