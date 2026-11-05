// The hour's budget of forgets a Naka tab can ask for: a forged unticked « vu » must not empty the owner's
// handled titles. The window is the finish window's (same hour, same shape); only the size differs. The
// status page's « Oublier » is the owner's own click and is not counted.

import type { FinishWindow } from "./finish-window";

export const MAX_FORGETS_PER_WINDOW = 10;

export function isForgetFull(window: FinishWindow): boolean {
  return window.count >= MAX_FORGETS_PER_WINDOW;
}
