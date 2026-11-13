// The owner's own ratings are read one at a time: a new run cancels the one before, and starts only once
// that one's read in flight has ended, so two reads never overlap.

/** One read, given whether its run is still the current one when its answer comes. */
export type ReadStep = (live: () => boolean) => Promise<void>;

export type ReadQueue = {
  /** `next` gives the next read, or undefined when the run is over. */
  run(next: () => ReadStep | undefined): void;
  cancel(): void;
};

export function createReadQueue(): ReadQueue {
  let turn = 0;
  let running: Promise<void> = Promise.resolve();
  async function loop(mine: number, next: () => ReadStep | undefined) {
    const live = () => mine === turn;
    for (let step = live() ? next() : undefined; step; ) {
      try {
        await step(live);
      } catch {
        // A failed read leaves its episode unread; the run goes on.
      }
      step = live() ? next() : undefined;
    }
  }
  return {
    run(next) {
      turn += 1;
      const mine = turn;
      running = running.then(() => loop(mine, next));
    },
    cancel() {
      turn += 1;
    },
  };
}
