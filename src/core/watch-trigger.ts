export const DEFAULT_THRESHOLD = 0.9;

export type WatchSignal = { progress: number; markedWatched: boolean };

export function isWatchComplete(
  signal: WatchSignal,
  threshold: number = DEFAULT_THRESHOLD,
): boolean {
  if (!(threshold > 0 && threshold <= 1)) {
    throw new RangeError(`threshold must be in (0, 1], got ${threshold}`);
  }
  return signal.markedWatched || signal.progress >= threshold;
}
