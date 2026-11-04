// The hour's budget of finishes (Ruling 15): a fixed window that opens at the first finish after the last
// one expired. Kept in the settings, so it survives a worker restart. A clock behind the window's start
// opens a new window there, as run-throttle does for its own gap: a clock set back must not block
// finishes for longer than an hour.

export const FINISH_WINDOW_MS = 3_600_000;
export const MAX_FINISHES_PER_WINDOW = 30;

export type FinishWindow = { from: number; count: number };

export function windowAt(
  stored: FinishWindow | undefined,
  at: number,
): FinishWindow {
  if (
    stored !== undefined &&
    at >= stored.from &&
    at - stored.from < FINISH_WINDOW_MS
  ) {
    return stored;
  }
  return { from: at, count: 0 };
}

export function isFull(window: FinishWindow): boolean {
  return window.count >= MAX_FINISHES_PER_WINDOW;
}

export function withOneMore(window: FinishWindow): FinishWindow {
  return { from: window.from, count: window.count + 1 };
}
