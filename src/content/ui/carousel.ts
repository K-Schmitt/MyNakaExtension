// The row's two arrows: each steps the track by one page (its visible width) and is disabled at its end
// of the list; both hide when the list fits. The track is measured again on every scroll and whenever the
// cursor enters it, since the first draw can come before the row is laid out (all zero: nothing moves).

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

export function wireArrows(
  track: TrackLike,
  prev: ElementLike,
  next: ElementLike,
): void {
  const step = (sign: number) => () =>
    track.scrollBy({ left: sign * track.clientWidth, behavior: "smooth" });
  onTrustedClick(prev, step(-1));
  onTrustedClick(next, step(1));
  const refresh = () => update(track, prev, next);
  track.addEventListener("scroll", refresh);
  track.addEventListener("pointerenter", refresh);
  refresh();
}

/** A redraw makes a new track: it opens where the old one was scrolled to (read before it left). */
export function carryScroll(left: unknown, to: TrackLike): void {
  if (typeof left === "number" && left > 0) to.scrollLeft = left;
}
