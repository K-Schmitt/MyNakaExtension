import { describe, expect, it } from "vitest";
import {
  type Clock,
  createRateLimiter,
  type RateLimiter,
  SkippedError,
} from "../src/core/rate-limiter";
import { createTabTurns, turnLimiters } from "../src/sw/fiche-tab-turns";

// The worker's limiters: one slot per 2 s for each site, on a fake clock.
function siteLimiters() {
  const clock = { time: 0, sleeps: [] as number[] };
  const fake: Clock = {
    now: () => clock.time,
    sleep: async (ms) => {
      clock.sleeps.push(ms);
      clock.time += ms;
    },
  };
  const limiters = {
    naka: createRateLimiter(fake, 1, 2000),
    sc: createRateLimiter(fake, 1, 2000),
  };
  return { clock, limiters };
}

const startedAt = (limiter: RateLimiter, clock: { time: number }) =>
  limiter.run(async () => clock.time);

describe("the site limiters of a turn, over the real limiter", () => {
  it("a superseded turn's read takes no slot: the next live read starts with no 2 s gap", async () => {
    const { clock, limiters } = siteLimiters();
    const turns = createTabTurns();
    const older = turnLimiters(limiters, turns.start(7));
    expect(await startedAt(older.sc, clock)).toBe(0);
    const dead = older.sc.run(async () => "ran");
    const newer = turnLimiters(limiters, turns.start(7));
    const next = startedAt(newer.sc, clock);
    await expect(dead).rejects.toBeInstanceOf(SkippedError);
    expect(await next).toBe(2000);
    expect(await startedAt(newer.sc, clock)).toBe(4000);
    expect(clock.sleeps).toEqual([2000, 2000]);
  });

  it("a live turn's reads take one slot each, as any caller's", async () => {
    const { clock, limiters } = siteLimiters();
    const live = turnLimiters(limiters, createTabTurns().start(7));
    const starts = [
      await startedAt(live.naka, clock),
      await startedAt(limiters.naka, clock),
      await startedAt(live.naka, clock),
    ];
    expect(starts).toEqual([0, 2000, 4000]);
  });

  it("a read's own check still holds on a live turn", async () => {
    const { limiters } = siteLimiters();
    const live = turnLimiters(limiters, createTabTurns().start(7));
    const skipped = live.sc.run(async () => 1, { skip: () => true });
    await expect(skipped).rejects.toBeInstanceOf(SkippedError);
  });
});

describe("the turns of the tabs, for one kind of read", () => {
  it("a new turn of a tab ends the older one's", () => {
    const turns = createTabTurns();
    const older = turns.start(7);
    expect(older.live()).toBe(true);
    const newer = turns.start(7);
    expect(older.live()).toBe(false);
    expect(newer.live()).toBe(true);
  });

  it("an older turn that ends leaves the newer live", () => {
    const turns = createTabTurns();
    const older = turns.start(7);
    const newer = turns.start(7);
    older.end();
    expect(newer.live()).toBe(true);
  });

  it("an ended turn is no longer live, and the tab's next turn is", () => {
    const turns = createTabTurns();
    const first = turns.start(7);
    first.end();
    expect(first.live()).toBe(false);
    expect(turns.start(7).live()).toBe(true);
  });

  it("the turns of two tabs are apart", () => {
    const turns = createTabTurns();
    const mine = turns.start(7);
    const other = turns.start(8);
    expect(mine.live()).toBe(true);
    expect(other.live()).toBe(true);
  });
});
