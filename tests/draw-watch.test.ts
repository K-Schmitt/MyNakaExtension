import { describe, expect, it } from "vitest";
import { createDrawWatch } from "../src/content/ui/draw-watch";
import { MIN_VISIBLE_MS } from "../src/content/ui/star-visibility";
import { FakeElement, fakeVisibility } from "./ui-fakes";

describe("createDrawWatch: the visibility watch of a block drawn again whole", () => {
  it("watches each row it is given, each in a place of its own", () => {
    const v = fakeVisibility();
    const draw = createDrawWatch(v.seen);
    const a = new FakeElement("div");
    const b = new FakeElement("div");
    draw.watch(a);
    draw.watch(b);
    expect([...v.observed]).toEqual([a, b]);
  });

  it("answers whether a click on the row counts, by the same 300 ms rule", () => {
    const v = fakeVisibility();
    const counts = createDrawWatch(v.seen).watch(new FakeElement("div"));
    v.report(false);
    expect(counts()).toBe(false);
    v.report(true);
    v.later(MIN_VISIBLE_MS);
    expect(counts()).toBe(true);
  });

  it("clear stops watching every row of the draw, and a later row is watched again", () => {
    const v = fakeVisibility();
    const draw = createDrawWatch(v.seen);
    draw.watch(new FakeElement("div"));
    draw.watch(new FakeElement("div"));
    draw.clear();
    expect(v.observed.size).toBe(0);
    const next = new FakeElement("div");
    draw.watch(next);
    expect([...v.observed]).toEqual([next]);
    draw.clear();
    draw.clear();
    expect(v.observed.size).toBe(0);
  });
});
