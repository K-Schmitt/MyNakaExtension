// I2, A2: at most one retry step waits in the queue. A step queued while another still waits replaces it:
// the new one runs after the last sync and keeps the earliest time, since a sync stamps its run at its
// start and the later time alone would miss the first sync's success. A step already started is left alone.
// A step is tracked as a finish only when it will try an entry: a status read must not show one otherwise.

type Step = { since: number; live: boolean };

export type RetryPorts = {
  enqueue(job: () => Promise<void>): void;
  track(job: () => Promise<void>): () => Promise<void>;
  /** true when a step would try an entry (read-only). */
  pending(since: number): Promise<boolean>;
  /** One step; true: queue another. */
  next(since: number): Promise<boolean>;
};

export type RetrySteps = {
  /** Queue a retry step counting the syncs run since `since`. */
  queue(since: number): void;
};

export function createRetrySteps(ports: RetryPorts): RetrySteps {
  let waiting: Step | undefined;
  const queue = (since: number): void => {
    const step = {
      since: Math.min(since, waiting?.since ?? since),
      live: true,
    };
    if (waiting) waiting.live = false;
    waiting = step;
    const run = ports.track(async () => {
      if (await ports.next(step.since)) queue(step.since);
    });
    ports.enqueue(async () => {
      if (!step.live) return;
      waiting = undefined;
      if (await ports.pending(step.since)) await run();
    });
  };
  return { queue };
}
