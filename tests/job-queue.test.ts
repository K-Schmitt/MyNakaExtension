import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobQueue } from "../src/sw/job-queue";

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createJobQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never runs two jobs at once, in FIFO order, over 50 jobs", async () => {
    const queue = createJobQueue();
    const rand = seeded(42);
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const results = Array.from({ length: 50 }, (_, i) =>
      queue.run(async () => {
        running++;
        peak = Math.max(peak, running);
        started.push(i);
        await delay(Math.floor(rand() * 100));
        running--;
        return i;
      }),
    );
    await vi.runAllTimersAsync();
    expect(await Promise.all(results)).toEqual(started);
    expect(started).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(peak).toBe(1);
  });

  it("starts a queued job only after the previous one has settled", async () => {
    const queue = createJobQueue();
    const events: string[] = [];
    let saved = "old";
    const first = queue.run(async () => {
      await delay(100);
      saved = "new";
      events.push("first done");
    });
    const second = queue.run(async () => {
      events.push(`second reads ${saved}`);
    });
    await vi.advanceTimersByTimeAsync(99);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, second]);
    expect(events).toEqual(["first done", "second reads new"]);
  });

  it("resolves each call with its own value", async () => {
    const queue = createJobQueue();
    const a = queue.run(async () => "a");
    const b = queue.run(async () => 2);
    expect(await a).toBe("a");
    expect(await b).toBe(2);
  });

  it("keeps running after a rejecting job and rejects only that call", async () => {
    const queue = createJobQueue();
    const bad = queue.run(async () => {
      throw new Error("boom");
    });
    const good = queue.run(async () => "ok");
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("ok");
    await expect(queue.run(async () => "later")).resolves.toBe("later");
  });

  it("keeps running after a synchronous throw", async () => {
    const queue = createJobQueue();
    const bad = queue.run((): Promise<never> => {
      throw new TypeError("sync");
    });
    const good = queue.run(async () => "ok");
    await expect(bad).rejects.toThrow(TypeError);
    await expect(good).resolves.toBe("ok");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "text"],
    ["a number", 0],
  ])("passes through a rejection with %s", async (_name, reason) => {
    const queue = createJobQueue();
    const bad = queue.run(() => Promise.reject(reason));
    const good = queue.run(async () => "ok");
    await expect(bad).rejects.toBe(reason);
    await expect(good).resolves.toBe("ok");
  });

  it("passes through a synchronous throw of a non-error value", async () => {
    const queue = createJobQueue();
    const bad = queue.run((): Promise<never> => {
      throw "plain";
    });
    await expect(bad).rejects.toBe("plain");
    await expect(queue.run(async () => 1)).resolves.toBe(1);
  });

  it("accepts a job queued from inside a running job", async () => {
    const queue = createJobQueue();
    const order: string[] = [];
    let inner: Promise<void> | undefined;
    await queue.run(async () => {
      inner = queue.run(async () => {
        order.push("inner");
      });
      order.push("outer");
    });
    await inner;
    expect(order).toEqual(["outer", "inner"]);
  });

  it("handles 20000 mixed jobs without stalling", async () => {
    const queue = createJobQueue();
    let settled = 0;
    const all = Array.from({ length: 20000 }, (_, i) =>
      queue
        .run(async () => {
          if (i % 3 === 0) throw new Error("fail");
          return i;
        })
        .then(
          () => settled++,
          () => settled++,
        ),
    );
    await Promise.all(all);
    expect(settled).toBe(20000);
  });
});
