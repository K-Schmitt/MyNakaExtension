export type JobQueue = {
  run<T>(job: () => Promise<T>): Promise<T>;
};

function ignore(): void {}

export function createJobQueue(): JobQueue {
  // `tail` only ever points at the latest link. Older links are unreachable
  // once settled, so the chain does not grow with the number of jobs.
  let tail: Promise<void> = Promise.resolve();

  return {
    run<T>(job: () => Promise<T>): Promise<T> {
      // A synchronous throw inside `then` becomes a rejection of `result`.
      const result = tail.then(job);
      tail = result.then(ignore, ignore);
      return result;
    },
  };
}
