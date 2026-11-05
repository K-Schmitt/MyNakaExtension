import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLD,
  DEFAULT_THRESHOLDS,
  isWatchComplete,
  THRESHOLD_CHOICES,
} from "../src/core/watch-trigger";

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

  it("accepts a threshold of exactly 1", () => {
    expect(isWatchComplete(unmarked(1), 1)).toBe(true);
    expect(isWatchComplete(unmarked(0.99), 1)).toBe(false);
  });

  it("throws RangeError for a negative threshold", () => {
    expect(() => isWatchComplete(unmarked(0.5), -0.1)).toThrow(RangeError);
  });

  it("validates the threshold even when marked watched", () => {
    expect(() =>
      isWatchComplete({ progress: 0, markedWatched: true }, 0),
    ).toThrow(RangeError);
  });

  it.each([0, 1.2, Number.NaN])("throws RangeError for threshold %s", (t) => {
    expect(() => isWatchComplete(unmarked(0.5), t)).toThrow(RangeError);
  });
});

describe("thresholds per kind", () => {
  it("the grid starts at 0.8 and the defaults sit on it", () => {
    expect([...THRESHOLD_CHOICES]).toEqual([0.8, 0.85, 0.9, 0.95, 0.99]);
    expect(DEFAULT_THRESHOLDS).toEqual({ film: 0.9, episode: 0.8 });
    expect(THRESHOLD_CHOICES).toContain(DEFAULT_THRESHOLDS.film);
    expect(THRESHOLD_CHOICES).toContain(DEFAULT_THRESHOLDS.episode);
  });

  it("the legacy single threshold stays 0.9", () => {
    expect(DEFAULT_THRESHOLD).toBe(0.9);
  });
});
