import { describe, expect, it } from "vitest";
import type { RateMessage } from "../src/ext/rating-messages";
import { handledCard } from "../src/sw/handled-card";
import type { JobDeps } from "../src/sw/job-deps";

// Any use of the deps fails the test: a message without a label must be refused before reading anything.
const untouched = new Proxy(
  {},
  {
    get(_target, key) {
      throw new Error(`deps.${String(key)} was read`);
    },
  },
) as JobDeps;

const rate = (over: Partial<RateMessage>): RateMessage => ({
  type: "rate",
  contentId: 7,
  label: "épisode",
  rating: 8,
  ...over,
});

describe("handledCard", () => {
  it("makes no card for an episode message that has a season but no episode", async () => {
    expect(await handledCard(untouched, rate({ season: 1 }))).toBeUndefined();
  });

  it("makes no card for an episode message that has an episode but no season", async () => {
    expect(await handledCard(untouched, rate({ episode: 2 }))).toBeUndefined();
  });
});
