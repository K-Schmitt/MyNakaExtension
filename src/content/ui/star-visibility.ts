// The visibility guard of every write control: a click on it counts only once IntersectionObserver v2 has
// said its row visible (not faded or filtered by an ancestor, not under a scale or rotation, not covered by
// an opaque element) for MIN_VISIBLE_MS without a break. v2 reports at most every 100 ms, so a control
// flashed into view between two hidden spells never counts. A pure 2D translation (Naka lifts a hovered
// episode box by 3 px) and an overlay at opacity 0 are not seen by v2: known gaps. No entry yet, an entry
// without `isVisible`, or a browser without the observer: the click counts, so a real click is never lost
// to a missing signal. A row taken off the page stays watched, so it is read afresh once put back; the row
// a slot (an episode box, the info row) drew last is unwatched when a new one replaces it, or when the slot
// is released (a block taken off or drawn again whole: draw-watch).
// Guarded controls: the stars (player, home row, title page and its episodes), the series confirmations
// (« Envoyer » and « Annuler »), the title page's « Annuler » and « Retirer la note », the removal
// question's « Retirer », and the SensCritique candidates of a question or of the title page.

import type { ElementLike } from "./dom-like";

export const MIN_VISIBLE_MS = 300;

export type VisibilityEntry = { target: unknown; isVisible?: boolean };
export type VisibilityObserver = {
  observe(el: unknown): void;
  unobserve(el: unknown): void;
};
export type ObserverMaker = (
  onEntries: (entries: VisibilityEntry[]) => void,
) => VisibilityObserver | undefined;
/** Starts watching a slot's star row; the answer says whether a click on it counts now. */
export type SeenWatch = (row: ElementLike, slot: object) => () => boolean;
/** The same, and `release` stops watching the row a slot drew last. */
export type ReleasableWatch = SeenWatch & { release(slot: object): void };

type Last = { visible: false } | { visible: true; since: number };

function nextLast(
  previous: Last | undefined,
  isVisible: boolean,
  now: number,
): Last {
  if (!isVisible) return { visible: false };
  return previous?.visible === true ? previous : { visible: true, since: now };
}

export function createSeenWatch(
  make: ObserverMaker,
  now: () => number,
): ReleasableWatch {
  const last = new WeakMap<object, Last>();
  const drawn = new WeakMap<object, object>();
  const observer = make((entries) => {
    for (const { target, isVisible } of entries) {
      if (typeof isVisible !== "boolean") continue;
      const row = target as object;
      last.set(row, nextLast(last.get(row), isVisible, now()));
    }
  });
  const counts = (row: object): boolean => {
    const seen = last.get(row);
    if (seen === undefined) return true;
    return seen.visible && now() - seen.since >= MIN_VISIBLE_MS;
  };
  const watch: SeenWatch = (row, slot) => {
    const previous = drawn.get(slot);
    if (previous !== undefined && previous !== row) {
      observer?.unobserve(previous);
    }
    drawn.set(slot, row);
    observer?.observe(row);
    return () => counts(row);
  };
  const release = (slot: object): void => {
    const row = drawn.get(slot);
    if (row === undefined) return;
    drawn.delete(slot);
    observer?.unobserve(row);
  };
  return Object.assign(watch, { release });
}
