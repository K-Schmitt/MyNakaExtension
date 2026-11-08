import { describe, expect, it } from "vitest";
import { arrowState, wireArrows } from "../src/content/ui/carousel";
import type { TrackLike } from "../src/content/ui/dom-like";
import { FakeElement } from "./ui-fakes";

describe("arrowState", () => {
  it("a list that fits: neither arrow can move", () => {
    expect(
      arrowState({ scrollLeft: 0, clientWidth: 300, scrollWidth: 300 }),
    ).toEqual({ prev: false, next: false });
  });

  it("at the start of a longer list: only next", () => {
    expect(
      arrowState({ scrollLeft: 0, clientWidth: 300, scrollWidth: 900 }),
    ).toEqual({ prev: false, next: true });
  });

  it("at the end: only prev", () => {
    expect(
      arrowState({ scrollLeft: 600, clientWidth: 300, scrollWidth: 900 }),
    ).toEqual({ prev: true, next: false });
  });

  it("half a pixel from the end counts as the end (1 px tolerance)", () => {
    expect(
      arrowState({ scrollLeft: 599.5, clientWidth: 300, scrollWidth: 900 }),
    ).toEqual({ prev: true, next: false });
  });

  it("a layout not done yet (all zero) moves nothing", () => {
    expect(
      arrowState({ scrollLeft: 0, clientWidth: 0, scrollWidth: 0 }),
    ).toEqual({ prev: false, next: false });
  });
});

class FakeTrack implements TrackLike {
  scrollLeft = 0;
  steps: number[] = [];
  private listeners: Record<string, (() => void)[]> = {};

  constructor(
    public clientWidth: number,
    public scrollWidth: number,
  ) {}

  scrollBy(o: { left: number; behavior: "smooth" }): void {
    this.steps.push(o.left);
  }

  addEventListener(type: "scroll" | "pointerenter", fn: () => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), fn];
  }

  fire(type: "scroll" | "pointerenter"): void {
    for (const fn of this.listeners[type] ?? []) fn();
  }
}

function wired(clientWidth: number, scrollWidth: number) {
  const track = new FakeTrack(clientWidth, scrollWidth);
  const prev = new FakeElement("button");
  const next = new FakeElement("button");
  wireArrows(track, prev, next);
  return { track, prev, next };
}

const disabled = (el: FakeElement) => [
  el.attributes.disabled,
  el.attributes["aria-disabled"],
];

describe("wireArrows", () => {
  it("at the start: prev disabled, next enabled, both shown", () => {
    const { prev, next } = wired(300, 900);
    expect(disabled(prev)).toEqual(["", "true"]);
    expect(disabled(next)).toEqual([undefined, "false"]);
    expect(prev.attributes.hidden).toBeUndefined();
    expect(next.attributes.hidden).toBeUndefined();
  });

  it("both hidden when neither can move", () => {
    const { prev, next } = wired(300, 300);
    expect(prev.attributes.hidden).toBe("");
    expect(next.attributes.hidden).toBe("");
  });

  it("a click steps one page, by the track's width, either way", () => {
    const { track, prev, next } = wired(300, 900);
    next.click(true);
    prev.click(true);
    expect(track.steps).toEqual([300, -300]);
  });

  it("a forged click steps nothing", () => {
    const { track, next } = wired(300, 900);
    next.click(false);
    expect(track.steps).toEqual([]);
  });

  it("a scroll to the end disables next and enables prev", () => {
    const { track, prev, next } = wired(300, 900);
    track.scrollLeft = 600;
    track.fire("scroll");
    expect(disabled(prev)).toEqual([undefined, "false"]);
    expect(disabled(next)).toEqual(["", "true"]);
  });

  it("measures again when the cursor enters (the first draw may come before layout)", () => {
    const { track, prev, next } = wired(0, 0);
    expect(next.attributes.hidden).toBe("");
    track.clientWidth = 300;
    track.scrollWidth = 900;
    track.fire("pointerenter");
    expect(prev.attributes.hidden).toBeUndefined();
    expect(next.attributes.hidden).toBeUndefined();
    expect(disabled(next)).toEqual([undefined, "false"]);
  });
});
