import { describe, expect, it } from "vitest";
import {
  createGestureGate,
  GESTURE_MERGE_MS,
  GESTURE_WINDOW_MS,
  type GestureEvent,
  isRecentGesture,
  listenToGestures,
  MAX_GESTURES,
} from "../src/content/user-gesture";

const click: GestureEvent = { type: "click", isTrusted: true };

function gateAt(start = 1000) {
  const clock = { now: start };
  const gate = createGestureGate(() => clock.now);
  return { clock, gate };
}

describe("isRecentGesture", () => {
  it("is false with no gesture", () => {
    expect(isRecentGesture(undefined, 1000, 3000)).toBe(false);
  });

  it("is true within the window, edges included", () => {
    expect(isRecentGesture(1000, 1000, 3000)).toBe(true);
    expect(isRecentGesture(1000, 4000, 3000)).toBe(true);
  });

  it("is false past the window", () => {
    expect(isRecentGesture(1000, 4001, 3000)).toBe(false);
  });

  it("is false when the clock went back", () => {
    expect(isRecentGesture(1000, 999, 3000)).toBe(false);
  });
});

describe("the gesture gate", () => {
  it("the window is 3 seconds, 300 ms make one gesture, 5 are kept", () => {
    expect(GESTURE_WINDOW_MS).toBe(3000);
    expect(GESTURE_MERGE_MS).toBe(300);
    expect(MAX_GESTURES).toBe(5);
  });

  it("two clicks let two takes through", () => {
    const { clock, gate } = gateAt();
    gate.note(click);
    clock.now += 500;
    gate.note(click);
    clock.now += 500;
    expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(false);
  });

  it("one click (pointerup, click and Enter together) is one gesture", () => {
    const { clock, gate } = gateAt();
    gate.note({ type: "pointerup", isTrusted: true });
    clock.now += 20;
    gate.note(click);
    clock.now += 20;
    gate.note({ type: "keydown", isTrusted: true, key: "Enter" });
    expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(false);
  });

  it("each take uses up the oldest gesture still in the window", () => {
    const { clock, gate } = gateAt(0);
    gate.note(click);
    clock.now = 2000;
    gate.note(click);
    clock.now = 2500;
    expect(gate.take()).toBe(true);
    clock.now = 4500;
    expect(gate.take()).toBe(true);
  });

  it("drops the gestures past the window", () => {
    const { clock, gate } = gateAt(0);
    gate.note(click);
    clock.now = 2500;
    gate.note(click);
    clock.now = 3500;
    expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(false);
  });

  it("keeps at most 5 gestures, dropping the oldest", () => {
    const { clock, gate } = gateAt();
    for (let i = 0; i < 7; i += 1) {
      gate.note(click);
      clock.now += 400;
    }
    const takes = Array.from({ length: 6 }, () => gate.take());
    expect(takes).toEqual([true, true, true, true, true, false]);
  });

  it("gives nothing with no gesture", () => {
    expect(gateAt().gate.take()).toBe(false);
  });

  it("lets one take through after a trusted click within the window", () => {
    const { clock, gate } = gateAt();
    gate.note(click);
    clock.now += GESTURE_WINDOW_MS;
    expect(gate.take()).toBe(true);
  });

  it("one gesture is used up by one take", () => {
    const { gate } = gateAt();
    gate.note(click);
    expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(false);
  });

  it("gives nothing after the window", () => {
    const { clock, gate } = gateAt();
    gate.note(click);
    clock.now += GESTURE_WINDOW_MS + 1;
    expect(gate.take()).toBe(false);
  });

  it.each([
    ["an untrusted click", { type: "click", isTrusted: false }],
    ["a click with no isTrusted", { type: "click" }],
    ["an untrusted pointerup", { type: "pointerup", isTrusted: false }],
    ["an untrusted Enter", { type: "keydown", isTrusted: false, key: "Enter" }],
    ["a trusted other key", { type: "keydown", isTrusted: true, key: "a" }],
    ["a trusted keydown with no key", { type: "keydown", isTrusted: true }],
    ["a trusted mousemove", { type: "mousemove", isTrusted: true }],
  ])("ignores %s", (_name, event: GestureEvent) => {
    const { gate } = gateAt();
    gate.note(event);
    expect(gate.take()).toBe(false);
  });

  it.each([
    ["a trusted pointerup", { type: "pointerup", isTrusted: true }],
    ["a trusted Enter", { type: "keydown", isTrusted: true, key: "Enter" }],
    ["a trusted Space", { type: "keydown", isTrusted: true, key: " " }],
  ])("counts %s", (_name, event: GestureEvent) => {
    const { gate } = gateAt();
    gate.note(event);
    expect(gate.take()).toBe(true);
  });

  it("a later gesture restarts the window", () => {
    const { clock, gate } = gateAt();
    gate.note(click);
    clock.now += 2000;
    gate.note(click);
    clock.now += 2000;
    expect(gate.take()).toBe(true);
  });
});

describe("listenToGestures", () => {
  it("listens to click, pointerup and keydown in the capture phase", () => {
    const listened: { type: string; capture: boolean }[] = [];
    const fns: ((event: GestureEvent) => void)[] = [];
    const { gate } = gateAt();
    listenToGestures(
      {
        addEventListener: (type, fn, capture) => {
          listened.push({ type, capture });
          fns.push(fn);
        },
      },
      gate,
    );
    expect(listened).toEqual([
      { type: "click", capture: true },
      { type: "pointerup", capture: true },
      { type: "keydown", capture: true },
    ]);
    fns[0]?.(click);
    expect(gate.take()).toBe(true);
  });
});
