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

  it("an older answer without them still reads", () => {
    expect(readSnapshot({ mode: "live" })).toEqual({ mode: "live" });
  });

  it("drops unknown keys inside the thresholds' object by refusing the answer", () => {
    expect(
      readSnapshot({ thresholds: { film: 0.9, episode: 0.8, extra: 1 } }),
    ).toBeUndefined();
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
