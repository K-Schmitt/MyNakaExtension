// Where an episode's badge sits in its thumb: the top-right corner, or just left of a control of Naka's
// that is already there. Pure: the thumb and its other children come in as page rectangles.

export type Rect = { top: number; left: number; right: number };

export const BADGE_INSET_PX = 8;
/** A child whose top-right corner is this close to the thumb's holds that corner. */
const CORNER_PX = 40;

// The picture fills the thumb: only a child that starts in the right half is a control in the corner.
const holdsCorner = (thumb: Rect, child: Rect): boolean =>
  child.left > (thumb.left + thumb.right) / 2 &&
  child.top - thumb.top < CORNER_PX &&
  thumb.right - child.right < CORNER_PX;

/** The badge's distance from the thumb's right edge, in px. */
export function badgeRight(thumb: Rect, children: readonly Rect[]): number {
  const lefts = children
    .filter((child) => holdsCorner(thumb, child))
    .map((child) => child.left);
  if (lefts.length === 0) return BADGE_INSET_PX;
  return Math.round(thumb.right - Math.min(...lefts)) + BADGE_INSET_PX;
}
