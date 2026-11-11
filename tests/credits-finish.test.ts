import { describe, expect, it } from "vitest";
import { parseEvent } from "../src/core/finish-event";
import { isComplete } from "../src/core/finish-handler";
import { CREDITS_FLOOR, THRESHOLD_CHOICES } from "../src/core/watch-trigger";
import { film } from "./finish-fakes";

const strict = (value: number) => ({ film: value, episode: value });

describe("a finish at the credits", () => {
  it("the floor is the lowest threshold choice", () => {
    expect(CREDITS_FLOOR).toBe(0.8);
    expect(CREDITS_FLOOR).toBe(Math.min(...THRESHOLD_CHOICES));
  });

  it("completes whatever the threshold, from the floor up", () => {
    const at = (progress: number) => ({
      source: "credits" as const,
      progress,
      kind: "episode" as const,
    });
    expect(isComplete(at(0.957), strict(0.99))).toBe(true);
    expect(isComplete(at(0.8), strict(0.99))).toBe(true);
    expect(isComplete({ ...at(0.9), kind: "film" }, strict(0.99))).toBe(true);
  });

  it("below the floor, the threshold rule applies", () => {
    const at = (progress: number) => ({
      source: "credits" as const,
      progress,
      kind: "episode" as const,
    });
    expect(isComplete(at(0.5), strict(0.9))).toBe(false);
    expect(isComplete(at(0.79), strict(0.8))).toBe(false);
    expect(isComplete(at(0.5), strict(0.5))).toBe(true);
  });

  it("leaves threshold and explicit as they were", () => {
    const th = { source: "threshold" as const, kind: "episode" as const };
    expect(isComplete({ ...th, progress: 0.957 }, strict(0.99))).toBe(false);
    expect(isComplete({ ...th, progress: 0.99 }, strict(0.99))).toBe(true);
    expect(
      isComplete(
        { source: "explicit", progress: 0, kind: "film" },
        strict(0.99),
      ),
    ).toBe(true);
  });

  it("a bad threshold still throws for a credits finish", () => {
    expect(() =>
      isComplete({ source: "credits", progress: 0.9, kind: "film" }, strict(0)),
    ).toThrow(RangeError);
  });

  it("the finish event accepts the credits source", () => {
    expect(parseEvent(film({ source: "credits" })).source).toBe("credits");
  });
});
