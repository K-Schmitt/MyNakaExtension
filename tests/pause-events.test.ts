import { describe, expect, it } from "vitest";
import { listenToPauses } from "../src/content/pause-events";

type Listener = { type: string; fn: (ev: { target: unknown }) => void };

function page() {
  const video = { currentTime: 30, duration: 600, currentSrc: "blob:a" };
  const listeners: (Listener & { capture: boolean })[] = [];
  const doc = {
    addEventListener(
      type: string,
      fn: (ev: { target: unknown }) => void,
      capture: boolean,
    ) {
      listeners.push({ type, fn, capture });
    },
    querySelector: (selector: string) => (selector === "video" ? video : null),
  };
  const calls: string[] = [];
  const samples: unknown[] = [];
  listenToPauses(doc, {
    paused: (sample) => {
      calls.push("paused");
      samples.push(sample);
    },
    resumed: () => {
      calls.push("resumed");
    },
  });
  const fire = (type: string, target: unknown) => {
    for (const l of listeners) if (l.type === type) l.fn({ target });
  };
  return { video, listeners, calls, samples, fire };
}

describe("the pause listener", () => {
  it("listens to pause and play in the capture phase", () => {
    const p = page();
    expect(p.listeners.map((l) => [l.type, l.capture])).toEqual([
      ["pause", true],
      ["play", true],
    ]);
  });

  it("reads the sample from the video at the pause", () => {
    const p = page();
    p.fire("pause", p.video);
    expect(p.samples).toEqual([
      { currentTime: 30, duration: 600, src: "blob:a" },
    ]);
  });

  it("tells a play of the video", () => {
    const p = page();
    p.fire("play", p.video);
    expect(p.calls).toEqual(["resumed"]);
  });

  it("ignores a pause or a play of any other element", () => {
    const p = page();
    p.fire("pause", { currentTime: 1, duration: 2, currentSrc: "x" });
    p.fire("play", {});
    p.fire("pause", null);
    expect(p.calls).toEqual([]);
  });
});
