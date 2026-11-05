import { describe, expect, it } from "vitest";
import { toSeasons } from "../src/naka/naka-seasons";

const MALCOLM = {
  seasons: [1, 2, 3, 4, 5, 6, 7],
  episodeCounts: {
    "1": 16,
    "2": 25,
    "3": 22,
    "4": 22,
    "5": 22,
    "6": 22,
    "7": 22,
  },
};

describe("toSeasons", () => {
  it("parses the recorded answer, the string keys becoming numbers", () => {
    expect(toSeasons(MALCOLM)).toEqual({
      seasons: [1, 2, 3, 4, 5, 6, 7],
      episodeCounts: { 1: 16, 2: 25, 3: 22, 4: 22, 5: 22, 6: 22, 7: 22 },
    });
  });

  it("keeps a season list with a gap as it is", () => {
    expect(
      toSeasons({ seasons: [1, 2, 4], episodeCounts: { "4": 8 } }),
    ).toEqual({ seasons: [1, 2, 4], episodeCounts: { 4: 8 } });
  });

  it("accepts a season with no count", () => {
    expect(toSeasons({ seasons: [1, 2], episodeCounts: { "1": 8 } })).toEqual({
      seasons: [1, 2],
      episodeCounts: { 1: 8 },
    });
  });

  it.each([
    ["key 0", { seasons: [1], episodeCounts: { "0": 5 } }],
    ["key x", { seasons: [1], episodeCounts: { x: 5 } }],
    ["key 01", { seasons: [1], episodeCounts: { "01": 5 } }],
    ["key -1", { seasons: [1], episodeCounts: { "-1": 5 } }],
    ["key 1.5", { seasons: [1], episodeCounts: { "1.5": 5 } }],
    ["a count of 1.5", { seasons: [1], episodeCounts: { "1": 1.5 } }],
    ["a count of 0", { seasons: [1], episodeCounts: { "1": 0 } }],
    ["a count of -3", { seasons: [1], episodeCounts: { "1": -3 } }],
    ["a string count", { seasons: [1], episodeCounts: { "1": "16" } }],
    ["a null count", { seasons: [1], episodeCounts: { "1": null } }],
    ["a season of 0", { seasons: [0, 1], episodeCounts: {} }],
    ["a season of 1.5", { seasons: [1.5], episodeCounts: {} }],
    ["a string season", { seasons: ["1"], episodeCounts: {} }],
    ["no season", { seasons: [], episodeCounts: {} }],
    ["seasons not a list", { seasons: 3, episodeCounts: {} }],
    ["no seasons key", { episodeCounts: { "1": 5 } }],
    ["no episodeCounts key", { seasons: [1] }],
    ["episodeCounts a list", { seasons: [1], episodeCounts: [5] }],
    ["episodeCounts null", { seasons: [1], episodeCounts: null }],
    ["a list", [MALCOLM]],
    ["a string", "x"],
    ["null", null],
    ["a number", 7],
  ])("refuses %s", (_name, body) => {
    expect(toSeasons(body)).toBeUndefined();
  });

  it("refuses a __proto__ key", () => {
    const body = JSON.parse(
      '{"seasons":[1],"episodeCounts":{"__proto__":{"1":2}}}',
    );
    expect(toSeasons(body)).toBeUndefined();
  });
});
