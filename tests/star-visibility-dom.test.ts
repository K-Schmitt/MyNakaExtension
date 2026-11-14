import { describe, expect, it } from "vitest";
import { intersectionObserverV2 } from "../src/content/ui/star-visibility-dom";

function fakeWindow(withV2: boolean) {
  const made: { init: unknown; observed: unknown[]; unobserved: unknown[] }[] =
    [];
  class FakeEntry {}
  if (withV2) {
    Object.defineProperty(FakeEntry.prototype, "isVisible", {
      get: () => true,
    });
  }
  class FakeObserver {
    readonly record: (typeof made)[number];
    constructor(
      readonly callback: (entries: unknown[]) => void,
      init: unknown,
    ) {
      this.record = { init, observed: [], unobserved: [] };
      made.push(this.record);
    }
    observe(el: unknown) {
      this.record.observed.push(el);
    }
    unobserve(el: unknown) {
      this.record.unobserved.push(el);
    }
  }
  return {
    win: {
      IntersectionObserver: FakeObserver,
      IntersectionObserverEntry: FakeEntry,
    } as never,
    made,
  };
}

describe("intersectionObserverV2: the real observer behind the stars' visibility (D7)", () => {
  it("tracks visibility with the smallest delay v2 allows, and forwards observe and unobserve", () => {
    const { win, made } = fakeWindow(true);
    const observer = intersectionObserverV2(win)(() => {});
    observer?.observe("row");
    observer?.unobserve("row");
    expect(made).toEqual([
      {
        init: { trackVisibility: true, delay: 100 },
        observed: ["row"],
        unobserved: ["row"],
      },
    ]);
  });

  it("passes the observer's entries on", () => {
    const { win } = fakeWindow(true);
    const got: unknown[] = [];
    let callback: ((entries: unknown[]) => void) | undefined;
    const spy = {
      IntersectionObserverEntry: (win as { IntersectionObserverEntry: unknown })
        .IntersectionObserverEntry,
      IntersectionObserver: class {
        constructor(cb: (entries: unknown[]) => void) {
          callback = cb;
        }
        observe() {}
        unobserve() {}
      },
    } as never;
    intersectionObserverV2(spy)((entries) => got.push(...entries));
    callback?.([{ target: "row", isVisible: false }]);
    expect(got).toEqual([{ target: "row", isVisible: false }]);
  });

  it("gives no observer without v2's isVisible (every click counts)", () => {
    const { win, made } = fakeWindow(false);
    expect(intersectionObserverV2(win)(() => {})).toBeUndefined();
    expect(made).toEqual([]);
  });

  it("gives no observer without IntersectionObserver at all", () => {
    expect(intersectionObserverV2({} as never)(() => {})).toBeUndefined();
  });
});
