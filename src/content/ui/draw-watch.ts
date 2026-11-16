// The D7 watch (star-visibility) for a block drawn again whole on each change (the player block, the home
// row, the title page's actions): each guarded row of a draw gets a place of its own, and `clear`, called
// before the next draw and when the block is taken off, stops watching every row of the last one.

import type { ElementLike } from "./dom-like";
import type { ReleasableWatch } from "./star-visibility";

/** Watches one row of controls; the answer says whether a click on it counts now (D7). */
export type RowWatch = (row: ElementLike) => () => boolean;

export function createDrawWatch(seen: ReleasableWatch): {
  watch: RowWatch;
  clear(): void;
} {
  let slots: object[] = [];
  return {
    watch: (row) => {
      const slot = {};
      slots.push(slot);
      return seen(row, slot);
    },
    clear: () => {
      for (const slot of slots) seen.release(slot);
      slots = [];
    },
  };
}
