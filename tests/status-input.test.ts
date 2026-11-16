import { describe, expect, it } from "vitest";
import { readSnapshot } from "../src/status/status-input";

describe("readSnapshot: the thresholds and the pause setting", () => {
  it("keeps valid ones", () => {
    expect(
      readSnapshot({
        mode: "live",
        thresholds: { film: 0.95, episode: 0.8 },
        pauseFromPercent: 40,
      }),
    ).toEqual({
      mode: "live",
      thresholds: { film: 0.95, episode: 0.8 },
      pauseFromPercent: 40,
    });
  });

  it("keeps pendingSettings when it is true, and refuses anything else", () => {
    expect(readSnapshot({ mode: "live", pendingSettings: true })).toEqual({
      mode: "live",
      pendingSettings: true,
    });
    for (const bad of [false, 1, "true", null]) {
      expect(
        readSnapshot({ mode: "live", pendingSettings: bad }),
      ).toBeUndefined();
    }
  });

  it("keeps pendingActions when it lists known actions once, and refuses anything else", () => {
    expect(
      readSnapshot({ mode: "live", pendingActions: ["forget", "reset"] }),
    ).toEqual({ mode: "live", pendingActions: ["forget", "reset"] });
    for (const bad of [
      [],
      ["wipe"],
      ["reset", "reset"],
      "reset",
      true,
      null,
      [1],
    ]) {
      expect(
        readSnapshot({ mode: "live", pendingActions: bad }),
      ).toBeUndefined();
    }
  });

  it("an older answer without them still reads", () => {
    expect(readSnapshot({ mode: "live" })).toEqual({ mode: "live" });
  });

  it("drops unknown keys inside the thresholds' object by refusing the answer", () => {
    expect(
      readSnapshot({ thresholds: { film: 0.9, episode: 0.8, extra: 1 } }),
    ).toBeUndefined();
  });

  it("keeps firstRunPending when true and refuses any other value", () => {
    expect(readSnapshot({ mode: "live", firstRunPending: true })).toEqual({
      mode: "live",
      firstRunPending: true,
    });
    for (const bad of [false, null, 1, "true"]) {
      expect(
        readSnapshot({ mode: "live", firstRunPending: bad }),
      ).toBeUndefined();
    }
  });

  it.each([
    { thresholds: { film: 0.5, episode: 0.8 } },
    { thresholds: "0.9" },
    { pauseFromPercent: 100 },
    { pauseFromPercent: -1 },
    { pauseFromPercent: "40" },
  ])("refuses the answer %j", (bad) => {
    expect(readSnapshot({ mode: "live", ...bad })).toBeUndefined();
  });
});

describe("readSnapshot: the ratings waiting", () => {
  it("keeps a non-negative integer", () => {
    expect(readSnapshot({ mode: "live", pendingRatings: 0 })).toEqual({
      mode: "live",
      pendingRatings: 0,
    });
    expect(readSnapshot({ mode: "live", pendingRatings: 3 })).toEqual({
      mode: "live",
      pendingRatings: 3,
    });
  });

  it.each([-1, 1.5, "3", null, Number.NaN])("refuses %j", (bad) => {
    expect(readSnapshot({ mode: "live", pendingRatings: bad })).toBeUndefined();
  });
});
