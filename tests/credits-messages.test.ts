import { describe, expect, it } from "vitest";
import {
  PAGE_CHANNEL,
  parsePageEvent,
  parseToWorker,
} from "../src/ext/messages";

const CH = PAGE_CHANNEL;
const credits = { channel: CH, kind: "credits", startMs: 1221305 };

describe("credits page event", () => {
  it("accepts a credits start with a season and episode, or none", () => {
    expect(parsePageEvent({ ...credits, season: 23, episode: 17 })).toEqual({
      ...credits,
      season: 23,
      episode: 17,
    });
    expect(parsePageEvent(credits)).toEqual(credits);
  });

  it("accepts the bounds 1 ms and just under 24 h", () => {
    expect(parsePageEvent({ ...credits, startMs: 1 })?.kind).toBe("credits");
    expect(parsePageEvent({ ...credits, startMs: 86_399_999 })?.kind).toBe(
      "credits",
    );
  });

  it.each([
    ["a season without episode", { ...credits, season: 23 }],
    ["an episode without season", { ...credits, episode: 17 }],
    ["an extra key", { ...credits, contentId: 4 }],
    ["a token", { ...credits, token: "t" }],
    ["no start", { channel: CH, kind: "credits" }],
    ["a zero start", { ...credits, startMs: 0 }],
    ["a negative start", { ...credits, startMs: -1 }],
    ["a fractional start", { ...credits, startMs: 1.5 }],
    ["a start of 24 h", { ...credits, startMs: 86_400_000 }],
    ["a string start", { ...credits, startMs: "1221305" }],
    ["a NaN start", { ...credits, startMs: Number.NaN }],
    ["a season 0", { ...credits, season: 0, episode: 1 }],
    ["a fractional episode", { ...credits, season: 1, episode: 1.5 }],
  ])("rejects %s", (_name, raw) => {
    expect(parsePageEvent(raw)).toBeUndefined();
  });
});

describe("finished from the credits", () => {
  it("parses", () => {
    expect(
      parseToWorker({
        type: "finished",
        source: "credits",
        progress: 0.957,
        contentId: 9,
        season: 23,
        episode: 17,
      }),
    ).toEqual({
      type: "finished",
      source: "credits",
      progress: 0.957,
      contentId: 9,
      season: 23,
      episode: 17,
    });
  });
});
