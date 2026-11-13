// The click grace both sessions share. A click that lands within GRACE_MS of a block's buttons appearing
// under the cursor is taken for one meant for the page: ignored. `shownAt` is when the buttons were last
// drawn; a new draw (an unlock, a move of the row, a changed view) starts the grace again.

export const GRACE_MS = 400;

/** A shown block with its grace clock. */
export type Graced = { shownAt: number };

/** The buttons were just drawn: the grace counts from now. */
export function startGrace(s: Graced, now: () => number): void {
  s.shownAt = now();
}

// A clock set back puts the draw in the future: the grace then starts again from now, instead of leaving
// every button dead until the clock catches up.
export function graceOver(s: Graced, now: () => number): boolean {
  if (now() < s.shownAt) s.shownAt = now();
  return now() - s.shownAt >= GRACE_MS;
}
