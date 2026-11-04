// Runs the latest of a burst of calls once the calls stop for `ms`. In memory: a worker restart drops it.
// Clearing a timer that already fired, or none, does nothing.

import type { Timer } from "./naka-proxy";

export function createDebounce(
  timer: Timer,
  ms: number,
): (fn: () => void) => void {
  let handle: unknown;
  return (fn) => {
    timer.clear(handle);
    handle = timer.set(fn, ms);
  };
}
