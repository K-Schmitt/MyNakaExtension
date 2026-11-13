import { describe, expect, it } from "vitest";
import {
  type Clock,
  createRateLimiter,
  SkippedError,
} from "../src/core/rate-limiter";

type FakeClock = Clock & { time: number; sleeps: number[] };

function fakeClock(start = 0): FakeClock {
  const clock: FakeClock = {
    time: start,
    sleeps: [],
    now: () => clock.time,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    },
  };
  return clock;
}

describe("createRateLimiter validation", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "rejects perWindow %s",
    (perWindow) => {
      expect(() => createRateLimiter(fakeClock(), perWindow, 1000)).toThrow(
        RangeError,
      );
    },
  );

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects windowMs %s",
    (windowMs) => {
      expect(() => createRateLimiter(fakeClock(), 3, windowMs)).toThrow(
        RangeError,
      );
    },
  );

  it("accepts the smallest valid values", () => {
    expect(() => createRateLimiter(fakeClock(), 1, 0.5)).not.toThrow();
  });
});

describe("createRateLimiter scheduling", () => {
  it("starts tasks at the exact expected times (3 per 1000 ms, 7 tasks)", async () => {
    const clock = fakeClock(100);
    const limiter = createRateLimiter(clock, 3, 1000);
    const starts: number[] = [];
    await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        limiter.run(async () => {
          starts.push(clock.now());
          return i;
        }),
      ),
    );
    expect(starts).toEqual([100, 100, 100, 1100, 1100, 1100, 2100]);
    expect(clock.sleeps).toEqual([1000, 1000]);
  });

  it("sleeps only the remaining time when the clock already advanced", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 2, 1000);
    await limiter.run(async () => 1);
    clock.time = 400;
    await limiter.run(async () => 2);
    clock.time = 700;
    const started: number[] = [];
    await limiter.run(async () => started.push(clock.now()));
    expect(started).toEqual([1000]);
    expect(clock.sleeps).toEqual([300]);
  });

  it("does not sleep exactly at the window boundary", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 1, 1000);
    await limiter.run(async () => 1);
    clock.time = 1000;
    await limiter.run(async () => 2);
    expect(clock.sleeps).toEqual([]);
  });

  it("sleeps one tick before the window boundary", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 1, 1000);
    await limiter.run(async () => 1);
    clock.time = 999;
    await limiter.run(async () => 2);
    expect(clock.sleeps).toEqual([1]);
  });

  it("waits one window at most when the clock was set back", async () => {
    const clock = fakeClock(10_000_000);
    const limiter = createRateLimiter(clock, 1, 2000);
    await limiter.run(async () => 1);
    clock.time = 0; // the system clock stepped back by almost three hours
    const started: number[] = [];
    await limiter.run(async () => started.push(clock.now()));
    expect(clock.sleeps).toEqual([2000]);
    expect(started).toEqual([2000]);
  });

  it("measures the window from the start of the task, not its end", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 1, 1000);
    await limiter.run(async () => {
      clock.time += 600;
    });
    await limiter.run(async () => 1);
    expect(clock.sleeps).toEqual([400]);
  });

  it("keeps any perWindow consecutive starts at least windowMs apart (100 tasks, 30 per 60000)", async () => {
    const clock = fakeClock(5);
    const limiter = createRateLimiter(clock, 30, 60000);
    const starts: number[] = [];
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        limiter.run(async () => {
          starts.push(clock.now());
          return i;
        }),
      ),
    );
    expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(starts).toHaveLength(100);
    for (let i = 0; i + 30 < starts.length; i++) {
      expect((starts[i + 30] ?? 0) - (starts[i] ?? 0)).toBeGreaterThanOrEqual(
        60000,
      );
    }
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] ?? 0).toBeGreaterThanOrEqual(starts[i - 1] ?? 0);
    }
  });

  it("runs tasks one at a time in FIFO order", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(clock, 10, 1000);
    const log: string[] = [];
    const gate = (label: string) => async () => {
      log.push(`start ${label}`);
      await Promise.resolve();
      await Promise.resolve();
      log.push(`end ${label}`);
    };
    await Promise.all([
      limiter.run(gate("a")),
      limiter.run(gate("b")),
      limiter.run(gate("c")),
    ]);
    expect(log).toEqual([
      "start a",
      "end a",
      "start b",
      "end b",
      "start c",
      "end c",
    ]);
  });

  it("does not call a queued task before the earlier one settles", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(clock, 10, 1000);
    let release: () => void = () => {};
    const first = limiter.run(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    let secondStarted = false;
    const second = limiter.run(async () => {
      secondStarted = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(secondStarted).toBe(false);
    release();
    await first;
    await second;
    expect(secondStarted).toBe(true);
  });
});

describe("createRateLimiter skip", () => {
  it("a call skipped once its slot is free rejects with SkippedError and never calls its task", async () => {
    const limiter = createRateLimiter(fakeClock(), 1, 2000);
    let called = false;
    const skipped = limiter.run(
      async () => {
        called = true;
      },
      { skip: () => true },
    );
    await expect(skipped).rejects.toBeInstanceOf(SkippedError);
    expect(called).toBe(false);
  });

  it("a skipped call takes no slot: the next call starts at once, the one after a window later", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 1, 2000);
    const starts: number[] = [];
    const started = async () => {
      starts.push(clock.now());
    };
    await limiter.run(started);
    const skipped = limiter.run(started, { skip: () => true });
    const next = limiter.run(started);
    const after = limiter.run(started);
    await expect(skipped).rejects.toBeInstanceOf(SkippedError);
    await next;
    await after;
    expect(starts).toEqual([0, 2000, 4000]);
    expect(clock.sleeps).toEqual([2000, 2000]);
  });

  it("the check runs after the wait: a call that dies while waiting gives up its slot", async () => {
    let dead = false;
    let time = 0;
    const clock: Clock = {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
        dead = true;
      },
    };
    const limiter = createRateLimiter(clock, 1, 2000);
    await limiter.run(async () => 1);
    const checked = limiter.run(async () => "ran", { skip: () => dead });
    await expect(checked).rejects.toBeInstanceOf(SkippedError);
    const starts: number[] = [];
    await limiter.run(async () => starts.push(time));
    expect(starts).toEqual([2000]);
  });

  it("a call whose check says go takes its slot as a call with no check does", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 1, 2000);
    const starts: number[] = [];
    const started = async () => {
      starts.push(clock.now());
    };
    await limiter.run(started, { skip: () => false });
    await limiter.run(started);
    await limiter.run(started, { skip: () => false });
    expect(starts).toEqual([0, 2000, 4000]);
  });

  it("a check that throws rejects the call with its error and takes no slot", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 1, 2000);
    const boom = new Error("check");
    const failing = limiter.run(async () => 1, {
      skip: () => {
        throw boom;
      },
    });
    await expect(failing).rejects.toBe(boom);
    const starts: number[] = [];
    await limiter.run(async () => starts.push(clock.now()));
    expect(starts).toEqual([0]);
  });
});

describe("createRateLimiter outcomes", () => {
  it("resolves with the task value", async () => {
    const limiter = createRateLimiter(fakeClock(), 2, 1000);
    await expect(limiter.run(async () => "ok")).resolves.toBe("ok");
  });

  it("rejects with the task's own error and keeps going", async () => {
    const limiter = createRateLimiter(fakeClock(), 5, 1000);
    const boom = new Error("boom");
    const failing = limiter.run(async () => {
      throw boom;
    });
    const after = limiter.run(async () => "next");
    await expect(failing).rejects.toBe(boom);
    await expect(after).resolves.toBe("next");
  });

  it("rejects with a non-Error value as is", async () => {
    const limiter = createRateLimiter(fakeClock(), 5, 1000);
    await expect(limiter.run(() => Promise.reject("plain"))).rejects.toBe(
      "plain",
    );
    await expect(limiter.run(async () => 1)).resolves.toBe(1);
  });

  it("treats a synchronous throw as a rejection and keeps going", async () => {
    const limiter = createRateLimiter(fakeClock(), 5, 1000);
    const boom = new Error("sync");
    const failing = limiter.run(() => {
      throw boom;
    });
    const after = limiter.run(async () => "next");
    await expect(failing).rejects.toBe(boom);
    await expect(after).resolves.toBe("next");
  });

  it("counts a failed task as a start", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(clock, 1, 1000);
    await limiter.run(() => Promise.reject(new Error("x"))).catch(() => {});
    await limiter.run(async () => 1);
    expect(clock.sleeps).toEqual([1000]);
  });

  it("counts a synchronous throw as a start", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(clock, 1, 1000);
    await limiter
      .run(() => {
        throw new Error("x");
      })
      .catch(() => {});
    await limiter.run(async () => 1);
    expect(clock.sleeps).toEqual([1000]);
  });

  it("keeps only the last perWindow start times (bounded history)", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 2, 1000);
    const starts: number[] = [];
    for (let i = 0; i < 6; i++) {
      await limiter.run(async () => starts.push(clock.now()));
    }
    expect(starts).toEqual([0, 0, 1000, 1000, 2000, 2000]);
  });

  it("is reusable after the queue drained", async () => {
    const clock = fakeClock(0);
    const limiter = createRateLimiter(clock, 1, 1000);
    await limiter.run(async () => 1);
    await limiter.run(async () => 2);
    clock.time += 5000;
    const t: number[] = [];
    await limiter.run(async () => t.push(clock.now()));
    expect(t).toEqual([6000]);
    expect(clock.sleeps).toEqual([1000]);
  });

  it("re-waits when sleep returns early, never with a zero sleep", async () => {
    let time = 0;
    const sleeps: number[] = [];
    const clock: Clock = {
      now: () => time,
      sleep: async (ms) => {
        sleeps.push(ms);
        time += Math.ceil(ms / 2);
      },
    };
    const limiter = createRateLimiter(clock, 1, 1000);
    await limiter.run(async () => 1);
    const t: number[] = [];
    await limiter.run(async () => t.push(time));
    expect(t[0]).toBeGreaterThanOrEqual(1000);
    expect(sleeps.length).toBeGreaterThan(1);
    expect(sleeps.every((ms) => ms > 0)).toBe(true);
  });
});
