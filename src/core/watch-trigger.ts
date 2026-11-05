// The legacy single threshold: kept for emptyState() and the stored state, no longer read for a decision.
export const DEFAULT_THRESHOLD = 0.9;

export type Thresholds = { film: number; episode: number };
export const THRESHOLD_CHOICES = [0.8, 0.85, 0.9, 0.95, 0.99] as const;
export const DEFAULT_THRESHOLDS: Thresholds = { film: 0.9, episode: 0.8 };

export type WatchSignal = {
  progress: number;
  /**
   * An explicit watched:true action seen in this session (e.g. Naka's
   * PUT /history/watched). NEVER the resume state of an already-watched
   * title: that would complete a film reopened and left after 30 seconds.
   */
  markedWatched: boolean;
};

export function isWatchComplete(
  signal: WatchSignal,
  threshold: number = DEFAULT_THRESHOLD,
): boolean {
  if (!(threshold > 0 && threshold <= 1)) {
    throw new RangeError(`threshold must be in (0, 1], got ${threshold}`);
  }
  return signal.markedWatched || signal.progress >= threshold;
}
