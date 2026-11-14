import { describe, expect, it } from "vitest";
import {
  createSeenWatch,
  type ObserverMaker,
  type VisibilityEntry,
} from "../src/content/ui/star-visibility";

type Target = { isConnected: boolean; name: string };

function fakeObserver() {
  const observed: Target[] = [];
  const unobserved: Target[] = [];
  let deliver: (entries: VisibilityEntry[]) => void = () => {};
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
  const entry = (target: Target, isVisible?: boolean): VisibilityEntry =>
    isVisible === undefined ? { target } : { target, isVisible };
  return {
    make,
    observed,
    unobserved,
    send: (...entries: VisibilityEntry[]) => deliver(entries),
    entry,
  };
}

const target = (name: string): Target => ({ isConnected: true, name });

describe("createSeenWatch: a star row's last visibility", () => {
  it("observes the row it is given", () => {
    const io = fakeObserver();
    const row = target("row");
    createSeenWatch(io.make)(row as never);
    expect(io.observed).toEqual([row]);
  });

  it("lets the click count before any entry has come (owner's decision D11)", () => {
    const io = fakeObserver();
    const seen = createSeenWatch(io.make)(target("row") as never);
    expect(seen()).toBe(true);
  });

  it("refuses the click while the last entry says hidden, and counts it again once visible", () => {
    const io = fakeObserver();
    const row = target("row");
    const seen = createSeenWatch(io.make)(row as never);
    io.send(io.entry(row, false));
    expect(seen()).toBe(false);
    io.send(io.entry(row, true));
    expect(seen()).toBe(true);
  });

  it("keeps the last of several entries in one batch", () => {
    const io = fakeObserver();
    const row = target("row");
    const seen = createSeenWatch(io.make)(row as never);
    io.send(io.entry(row, true), io.entry(row, false));
    expect(seen()).toBe(false);
  });

  it("reads each row on its own", () => {
    const io = fakeObserver();
    const watch = createSeenWatch(io.make);
    const hidden = target("hidden");
    const shown = target("shown");
    const seenHidden = watch(hidden as never);
    const seenShown = watch(shown as never);
    io.send(io.entry(hidden, false), io.entry(shown, true));
    expect(seenHidden()).toBe(false);
    expect(seenShown()).toBe(true);
  });

  it("ignores an entry without isVisible (an observer without v2): the click counts", () => {
    const io = fakeObserver();
    const row = target("row");
    const seen = createSeenWatch(io.make)(row as never);
    io.send(io.entry(row, false), io.entry(row));
    expect(seen()).toBe(false);
    const other = target("other");
    const seenOther = createSeenWatch(io.make)(other as never);
    io.send(io.entry(other));
    expect(seenOther()).toBe(true);
  });

  it("lets every click count when the browser has no observer", () => {
    const seen = createSeenWatch(() => undefined)(target("row") as never);
    expect(seen()).toBe(true);
  });

  it("stops observing a row once it has left the document, and only then", () => {
    const io = fakeObserver();
    const watch = createSeenWatch(io.make);
    const kept = target("kept");
    const gone = target("gone");
    watch(kept as never);
    watch(gone as never);
    gone.isConnected = false;
    io.send(io.entry(kept, true), io.entry(gone, false));
    expect(io.unobserved).toEqual([gone]);
  });
});
