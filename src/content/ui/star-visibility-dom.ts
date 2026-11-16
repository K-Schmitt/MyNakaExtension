// The real IntersectionObserver v2 behind the write buttons' visibility: `trackVisibility` with the
// smallest delay v2 allows. A browser without the observer, or without v2's `isVisible`, gets none, so every
// click counts there (star-visibility).

import {
  createSeenWatch,
  type ObserverMaker,
  type ReleasableWatch,
  type VisibilityEntry,
} from "./star-visibility";

const V2_DELAY_MS = 100;

type V2Init = { trackVisibility: true; delay: number };
type V2Observer = {
  observe(el: unknown): void;
  unobserve(el: unknown): void;
};
export type ObserverWindow = {
  IntersectionObserver?: new (
    callback: (entries: VisibilityEntry[]) => void,
    init: V2Init,
  ) => V2Observer;
  IntersectionObserverEntry?: { prototype: object };
};

function hasV2(win: ObserverWindow): boolean {
  const entry = win.IntersectionObserverEntry;
  return entry !== undefined && "isVisible" in entry.prototype;
}

export function intersectionObserverV2(win: ObserverWindow): ObserverMaker {
  return (onEntries) => {
    const Observer = win.IntersectionObserver;
    if (Observer === undefined || !hasV2(win)) return undefined;
    const observer = new Observer((entries) => onEntries(entries), {
      trackVisibility: true,
      delay: V2_DELAY_MS,
    });
    return {
      observe: (el) => observer.observe(el),
      unobserve: (el) => observer.unobserve(el),
    };
  };
}

/** One surface's visibility watch in the page: the isolated world's own observer, which a page script
 * cannot patch. */
export function pageSeenWatch(win: ObserverWindow): ReleasableWatch {
  return createSeenWatch(intersectionObserverV2(win), () => performance.now());
}
