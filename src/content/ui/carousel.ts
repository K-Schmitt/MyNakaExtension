// The row's two arrows: each steps the track by one page (its visible width) and is disabled at its end
// of the list; both hide when the list fits. The track is measured again on every scroll, whenever the
// cursor enters it and whenever its size changes: the row is drawn detached, before the keeper places it
// (all zero: nothing moves), so the measure that counts comes once it is laid out.

import type { ElementLike, TrackLike } from "./dom-like";
import { onTrustedClick } from "./trusted";

type Measures = Pick<TrackLike, "scrollLeft" | "clientWidth" | "scrollWidth">;

// Scroll positions can be fractional on scaled screens: within 1 px of an end counts as the end.
const TOLERANCE_PX = 1;

export function arrowState(m: Measures): { prev: boolean; next: boolean } {
  return {
    prev: m.scrollLeft > TOLERANCE_PX,
    next: m.scrollLeft + m.clientWidth < m.scrollWidth - TOLERANCE_PX,
  };
}

function setFlag(el: ElementLike, name: string, on: boolean): void {
  if (on) el.setAttribute(name, "");
  else el.removeAttribute(name);
}

function showArrow(el: ElementLike, canMove: boolean, shown: boolean): void {
  setFlag(el, "disabled", !canMove);
  el.setAttribute("aria-disabled", String(!canMove));
  setFlag(el, "hidden", !shown);
}

function update(track: TrackLike, prev: ElementLike, next: ElementLike): void {
  const state = arrowState(track);
  const shown = state.prev || state.next;
  showArrow(prev, state.prev, shown);
  showArrow(next, state.next, shown);
}

/** Calls `onResize` whenever the track's size changes (a ResizeObserver in the page); returns the stop. */
export type SizeWatch = (track: TrackLike, onResize: () => void) => () => void;

/** The page's parts the arrows use; `reducedMotion` is read at each click, the setting can change live. */
export type ArrowPorts = {
  watchSize?: SizeWatch;
  reducedMotion?: () => boolean;
};

/** Returns the stop of the size watch. */
export function wireArrows(
  track: TrackLike,
  prev: ElementLike,
  next: ElementLike,
  { watchSize, reducedMotion }: ArrowPorts = {},
): () => void {
  const step = (sign: number) => () =>
    track.scrollBy({
      left: sign * track.clientWidth,
      behavior: reducedMotion?.() ? "auto" : "smooth",
    });
  onTrustedClick(prev, step(-1));
  onTrustedClick(next, step(1));
  const refresh = () => update(track, prev, next);
  track.addEventListener("scroll", refresh);
  track.addEventListener("pointerenter", refresh);
  refresh();
  return watchSize?.(track, refresh) ?? (() => {});
}

/** A redraw makes a new track: it opens where the old one was scrolled to (read before it left). */
export function carryScroll(left: unknown, to: TrackLike): void {
  if (typeof left === "number" && left > 0) to.scrollLeft = left;
}
