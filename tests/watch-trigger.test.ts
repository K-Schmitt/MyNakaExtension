import { describe, expect, it } from "vitest";
import { isWatchComplete } from "../src/core/watch-trigger";

const unmarked = (progress: number) => ({ progress, markedWatched: false });

describe("isWatchComplete", () => {
  it("is false just under the default threshold", () => {
    expect(isWatchComplete(unmarked(0.89))).toBe(false);
  });

  it("is true at the default threshold", () => {
    expect(isWatchComplete(unmarked(0.9))).toBe(true);
  });

  it("is true above the threshold", () => {
    expect(isWatchComplete(unmarked(0.96))).toBe(true);
  });

  it("is false when the film is left after 30 s", () => {
    expect(isWatchComplete(unmarked(0.01))).toBe(false);
  });

  it("is true when marked watched despite low progress", () => {
    expect(isWatchComplete({ progress: 0.3, markedWatched: true })).toBe(true);
  });

  it("is false for NaN progress when not marked", () => {
    expect(isWatchComplete(unmarked(Number.NaN))).toBe(false);
  });

  it("is true for NaN progress when marked watched", () => {
    expect(isWatchComplete({ progress: Number.NaN, markedWatched: true })).toBe(
      true,
    );
  });

  it("is false for negative progress", () => {
    expect(isWatchComplete(unmarked(-1))).toBe(false);
  });

  it("is true for progress above 1", () => {
    expect(isWatchComplete(unmarked(1.5))).toBe(true);
  });

  it("honours a custom threshold", () => {
    expect(isWatchComplete(unmarked(0.94), 0.95)).toBe(false);
    expect(isWatchComplete(unmarked(0.95), 0.95)).toBe(true);
  });

  it.each([0, 1.2, Number.NaN])("throws RangeError for threshold %s", (t) => {
    expect(() => isWatchComplete(unmarked(0.5), t)).toThrow(RangeError);
  });
});
