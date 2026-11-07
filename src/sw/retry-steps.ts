// I2, A2: at most one retry step waits in the queue. A step queued while another still waits replaces it:
// the new one runs after the last sync and keeps the earliest time, since a sync stamps its run at its
// start and the later time alone would miss the first sync's success. A step already started is left alone.

type Step = { since: number; live: boolean };

export type RetrySteps = {
  /** Queue a retry step counting the syncs run since `since`. */
  queue(since: number): void;
};

export function createRetrySteps(
  enqueue: (job: () => Promise<void>) => void,
  track: (job: () => Promise<void>) => () => Promise<void>,
  retryNext: (since: number) => Promise<boolean>,
): RetrySteps {
  let waiting: Step | undefined;
  const queue = (since: number): void => {
    const step = {
      since: Math.min(since, waiting?.since ?? since),
      live: true,
    };
    if (waiting) waiting.live = false;
    waiting = step;
    const run = track(async () => {
      if (await retryNext(step.since)) queue(step.since);
    });
    enqueue(async () => {
      if (!step.live) return;
      waiting = undefined;
      await run();
    });
  };
  return { queue };
}
