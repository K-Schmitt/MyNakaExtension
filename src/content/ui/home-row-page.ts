// The home row's ports in the page: the real document, the keeper's DOM ports over Naka's list, the page's
// timers, a ResizeObserver on the carousel's track and the tiles' visibility watch (D7).

import type { SizeWatch } from "./carousel";
import { createRowPorts } from "./home-row-dom";
import type { HomeRowPorts } from "./home-row-ui";
import { type ObserverWindow, pageSeenWatch } from "./star-visibility-dom";

const pageTimer = {
  set: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clear: (handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// The track is a `div` the real document made: a real element, which a ResizeObserver can watch.
const watchSize: SizeWatch = (track, onResize) => {
  const observer = new ResizeObserver(() => onResize());
  observer.observe(track as unknown as Element);
  return () => observer.disconnect();
};

export function homeRowPorts(doc: Document): HomeRowPorts {
  return {
    doc,
    // The real document made the host, so it is a real element: the DOM binding moves it among Naka's rows.
    keeper: (host) =>
      createRowPorts(doc, host as unknown as HTMLElement, pageTimer, () =>
        performance.now(),
      ),
    watchSize,
    reducedMotion: () =>
      doc.defaultView?.matchMedia(REDUCED_MOTION).matches ?? false,
    seen: pageSeenWatch(window as unknown as ObserverWindow),
  };
}
