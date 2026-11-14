// D7 (owner's decision D11, 2026-11-14): a title page star click counts only while IntersectionObserver v2
// last said its row is visible — not faded or filtered by an ancestor, not under a scale or rotation, not
// covered by an opaque element. A pure 2D translation (Naka lifts a hovered episode box by 3 px) and a
// transparent overlay are not seen by v2: known gaps. No entry yet, an entry without `isVisible`, or a
// browser without the observer: the click counts, so a real click is never lost to a missing signal.
// One observer per page; a row taken off the document is no longer observed once its entry says so.

import type { ElementLike } from "./dom-like";

export type VisibilityEntry = { target: unknown; isVisible?: boolean };
export type VisibilityObserver = {
  observe(el: unknown): void;
  unobserve(el: unknown): void;
};
export type ObserverMaker = (
  onEntries: (entries: VisibilityEntry[]) => void,
) => VisibilityObserver | undefined;
/** Starts watching a star row; the answer says whether a click on it counts now. */
export type SeenWatch = (row: ElementLike) => () => boolean;

function leftDocument(target: unknown): boolean {
  return (target as { isConnected?: unknown }).isConnected === false;
}

export function createSeenWatch(make: ObserverMaker): SeenWatch {
  const last = new WeakMap<object, boolean>();
  const observer = make((entries) => {
    for (const entry of entries) {
      const target = entry.target as object;
      if (typeof entry.isVisible === "boolean") {
        last.set(target, entry.isVisible);
      }
      if (leftDocument(target)) observer?.unobserve(target);
    }
  });
  return (row) => {
    observer?.observe(row);
    return () => last.get(row) !== false;
  };
}
