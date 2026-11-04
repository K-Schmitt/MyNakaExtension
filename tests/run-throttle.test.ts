import { describe, expect, it } from "vitest";
import {
  AUTO_RUN_GAP_MS,
  PLAYLIST_DEBOUNCE_MS,
  shouldStartAutoRun,
} from "../src/sw/run-throttle";

describe("run throttle constants", () => {
  it("spaces automatic runs by 15 minutes", () => {
    expect(AUTO_RUN_GAP_MS).toBe(900_000);
  });

  it("debounces playlist changes by 5 seconds", () => {
    expect(PLAYLIST_DEBOUNCE_MS).toBe(5000);
  });
});

describe("shouldStartAutoRun", () => {
  const last = 1_000_000;

  it("starts when there was no automatic run yet", () => {
    expect(shouldStartAutoRun(undefined, 0)).toBe(true);
  });

  it("waits at gap - 1 ms", () => {
    expect(shouldStartAutoRun(last, last + AUTO_RUN_GAP_MS - 1)).toBe(false);
  });

  it("starts at exactly the gap", () => {
    expect(shouldStartAutoRun(last, last + AUTO_RUN_GAP_MS)).toBe(true);
  });

  it("starts after the gap", () => {
    expect(shouldStartAutoRun(last, last + AUTO_RUN_GAP_MS + 1)).toBe(true);
  });

  it("waits right after a run", () => {
    expect(shouldStartAutoRun(last, last)).toBe(false);
  });

  it("starts when the clock went backwards", () => {
    expect(shouldStartAutoRun(last, last - 1)).toBe(true);
    expect(shouldStartAutoRun(last, 0)).toBe(true);
  });

  it("does not let a stamp in the far future block forever", () => {
    expect(shouldStartAutoRun(Number.MAX_SAFE_INTEGER, 5)).toBe(true);
  });
});
