import { describe, expect, it } from "vitest";
import {
  createSeenWatch,
  MIN_VISIBLE_MS,
  type ObserverMaker,
  type VisibilityEntry,
} from "../src/content/ui/star-visibility";

type Target = { isConnected: boolean; name: string };

function world() {
  const observed: Target[] = [];
  const unobserved: Target[] = [];
  let deliver: (entries: VisibilityEntry[]) => void = () => {};
  const clock = { now: 1000 };
  const make: ObserverMaker = (onEntries) => {
    deliver = onEntries;
    return {
      observe: (el) => {
        observed.push(el as Target);
      },
      unobserve: (el) => {
        unobserved.push(el as Target);
      },
    };
  };
  const watch = createSeenWatch(make, () => clock.now);
  const send = (target: Target, isVisible?: boolean) =>
    deliver([isVisible === undefined ? { target } : { target, isVisible }]);
  const later = (ms: number) => {
    clock.now += ms;
  };
  return { watch, observed, unobserved, send, later };
}

const target = (name: string): Target => ({ isConnected: true, name });
const slot = () => ({});

describe("createSeenWatch: whether a click on a star row counts (D7)", () => {
  it("observes the row it is given", () => {
    const w = world();
    const row = target("row");
    w.watch(row as never, slot());
    expect(w.observed).toEqual([row]);
  });

  it("counts a click before any entry has come (owner's decision D11)", () => {
    const w = world();
    expect(w.watch(target("row") as never, slot())()).toBe(true);
  });

  it("refuses a click while the last entry says hidden", () => {
    const w = world();
    const row = target("row");
    const counts = w.watch(row as never, slot());
    w.send(row, false);
    w.later(5000);
    expect(counts()).toBe(false);
  });

  it(`counts a click only once the row has been visible for ${MIN_VISIBLE_MS} ms without a break (owner, 2026-11-14)`, () => {
    const w = world();
    const row = target("row");
    const counts = w.watch(row as never, slot());
    w.send(row, false);
    w.send(row, true);
    w.later(MIN_VISIBLE_MS - 1);
    expect(counts()).toBe(false);
    w.later(1);
    expect(counts()).toBe(true);
  });

  it("does not restart the wait on a second visible entry", () => {
    const w = world();
    const row = target("row");
    const counts = w.watch(row as never, slot());
    w.send(row, true);
    w.later(MIN_VISIBLE_MS - 10);
    w.send(row, true);
    w.later(10);
    expect(counts()).toBe(true);
  });

  it("restarts the wait after a hidden entry: a flash between two hidden spells never counts", () => {
    const w = world();
    const row = target("row");
    const counts = w.watch(row as never, slot());
    w.send(row, true);
    w.later(MIN_VISIBLE_MS);
    w.send(row, false);
    w.send(row, true);
    w.later(50);
    expect(counts()).toBe(false);
  });

  it("reads each row on its own", () => {
    const w = world();
    const hidden = target("hidden");
    const shown = target("shown");
    const countsHidden = w.watch(hidden as never, slot());
    const countsShown = w.watch(shown as never, slot());
    w.send(hidden, false);
    w.send(shown, true);
    w.later(MIN_VISIBLE_MS);
    expect(countsHidden()).toBe(false);
    expect(countsShown()).toBe(true);
  });

  it("ignores an entry without isVisible (an observer without v2)", () => {
    const w = world();
    const row = target("row");
    const counts = w.watch(row as never, slot());
    w.send(row, false);
    w.send(row);
    expect(counts()).toBe(false);
    const other = target("other");
    const countsOther = w.watch(other as never, slot());
    w.send(other);
    expect(countsOther()).toBe(true);
  });

  it("counts every click when the browser has no observer", () => {
    const watch = createSeenWatch(
      () => undefined,
      () => 0,
    );
    expect(watch(target("row") as never, slot())()).toBe(true);
  });

  it("keeps watching a row taken off the page, so it counts again once put back and seen", () => {
    const w = world();
    const row = target("row");
    row.isConnected = false;
    const counts = w.watch(row as never, slot());
    w.send(row, false); // the observer's first entry, the row not placed yet
    row.isConnected = true;
    w.send(row, true);
    w.later(MIN_VISIBLE_MS);
    expect(counts()).toBe(true);
    expect(w.unobserved).toEqual([]);
  });

  it("stops watching a slot's old row once a new row takes its place, and only then", () => {
    const w = world();
    const place = slot();
    const old = target("old");
    const fresh = target("fresh");
    w.watch(old as never, place);
    w.watch(old as never, place);
    expect(w.unobserved).toEqual([]);
    w.watch(fresh as never, place);
    expect(w.unobserved).toEqual([old]);
    w.watch(target("elsewhere") as never, slot());
    expect(w.unobserved).toEqual([old]);
  });
});
