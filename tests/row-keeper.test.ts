import { describe, expect, it } from "vitest";
import type { EndTimer } from "../src/content/ui/end-poll";
import { createRowKeeper } from "../src/content/ui/row-keeper";
import type { ListSnapshot } from "../src/content/ui/row-place";

function setup(first: ListSnapshot | undefined) {
  let snap = first;
  let onChange: (() => void) | undefined;
  const applied: string[] = [];
  let detached = 0;
  let unwatched = 0;
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 0;
  const timer: EndTimer = {
    set(fn, ms) {
      next += 1;
      timers.set(next, { fn, ms });
      return next;
    },
    clear(handle) {
      timers.delete(handle as number);
    },
  };
  const keeper = createRowKeeper({
    snapshot: () => snap,
    apply: (move) => {
      applied.push(move);
    },
    detach: () => {
      detached += 1;
    },
    watch: (fn) => {
      onChange = fn;
      return () => {
        unwatched += 1;
        onChange = undefined;
      };
    },
    timer,
  });
  return {
    keeper,
    applied,
    timers,
    set: (s: ListSnapshot | undefined) => {
      snap = s;
    },
    change: () => onChange?.(),
    hasWatch: () => onChange !== undefined,
    detached: () => detached,
    unwatched: () => unwatched,
  };
}

describe("createRowKeeper", () => {
  it("applies nothing without a list", () => {
    const t = setup(undefined);
    t.keeper.start();
    expect(t.applied).toEqual([]);
    expect(t.timers.size).toBe(0);
  });

  it("places the row after Reprendre once", () => {
    const t = setup({ reprendre: 0, host: -1, age: 0 });
    t.keeper.start();
    expect(t.applied).toEqual(["after-reprendre"]);
    t.set({ reprendre: 0, host: 1, age: 10 });
    t.change();
    expect(t.applied).toEqual(["after-reprendre"]);
  });

  it("never goes to the top when Reprendre appears before the timer", () => {
    const t = setup({ reprendre: -1, host: -1, age: 300 });
    t.keeper.start();
    expect(t.applied).toEqual([]);
    expect([...t.timers.values()].map((x) => x.ms)).toEqual([700]);
    t.set({ reprendre: 0, host: -1, age: 330 });
    t.change();
    expect(t.applied).toEqual(["after-reprendre"]);
    expect(t.timers.size).toBe(0);
  });

  it("goes to the top when the wait is spent", () => {
    const t = setup({ reprendre: -1, host: -1, age: 300 });
    t.keeper.start();
    t.set({ reprendre: -1, host: -1, age: 1000 });
    [...t.timers.values()][0]?.fn();
    expect(t.applied).toEqual(["top"]);
  });

  it("a start after a stop places the row again in Naka's new list (a return to the home page)", () => {
    const t = setup({ reprendre: 0, host: -1, age: 0 });
    t.keeper.start();
    t.keeper.stop();
    expect(t.detached()).toBe(1);
    t.set({ reprendre: -1, host: -1, age: 0 }); // the new list node, Reprendre not drawn yet
    t.keeper.start();
    expect(t.hasWatch()).toBe(true);
    expect([...t.timers.values()].map((x) => x.ms)).toEqual([1000]);
    t.set({ reprendre: 0, host: -1, age: 120 });
    t.change();
    expect(t.applied).toEqual(["after-reprendre", "after-reprendre"]);
    expect(t.timers.size).toBe(0);
  });

  it("applies nothing after stop and detaches once", () => {
    const t = setup({ reprendre: -1, host: -1, age: 0 });
    t.keeper.start();
    t.keeper.stop();
    t.set({ reprendre: 0, host: -1, age: 400 });
    t.change();
    expect(t.applied).toEqual([]);
    expect(t.detached()).toBe(1);
    expect(t.unwatched()).toBe(1);
    expect(t.timers.size).toBe(0);
    expect(t.hasWatch()).toBe(false);
  });
});
