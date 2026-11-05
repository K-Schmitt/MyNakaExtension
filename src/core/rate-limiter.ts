export type Clock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

export type RateLimiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
};

function assertLimits(perWindow: number, windowMs: number): void {
  if (!Number.isSafeInteger(perWindow) || perWindow < 1) {
    throw new RangeError("perWindow must be a safe integer >= 1");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError("windowMs must be a finite number > 0");
  }
}

async function waitForSlot(
  clock: Clock,
  starts: readonly number[],
  perWindow: number,
  windowMs: number,
): Promise<void> {
  const oldest = starts[0];
  if (starts.length < perWindow || oldest === undefined) return;
  // A clock set back puts the oldest start ahead of now: the window then counts from now, so a clock
  // set back never makes the wait longer than one window (as run-throttle and the finish window do).
  const from = Math.min(oldest, clock.now());
  for (
    let wait = from + windowMs - clock.now();
    wait > 0;
    wait = from + windowMs - clock.now()
  ) {
    await clock.sleep(wait);
  }
}

export function createRateLimiter(
  clock: Clock,
  perWindow: number,
  windowMs: number,
): RateLimiter {
  assertLimits(perWindow, windowMs);
  const starts: number[] = [];
  let tail: Promise<unknown> = Promise.resolve();

  async function start<T>(task: () => Promise<T>): Promise<T> {
    await waitForSlot(clock, starts, perWindow, windowMs);
    starts.push(clock.now());
    if (starts.length > perWindow) starts.shift();
    return task();
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(() => start(task));
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
