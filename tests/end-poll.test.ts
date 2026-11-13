import { describe, expect, it } from "vitest";
import {
  END_POLL_MS,
  type EndTimer,
  pollSchedule,
} from "../src/content/ui/end-poll";
import { fakeClock, flush } from "./end-block-fakes";

const LAST_MS = END_POLL_MS.at(-1) ?? 0;

function recorder() {
  const judged: unknown[] = [];
  const ended: boolean[] = [];
  return {
    judged,
    ended,
    judge: (answer: unknown): boolean => {
      judged.push(answer);
      return false;
    },
    onEnd: (answered: boolean): void => {
      ended.push(answered);
    },
  };
}

// A timer whose clear does nothing: each set callback can still be fired by hand.
function stubbornTimer() {
  const due: (() => void)[] = [];
  const timer: EndTimer = {
    set: (fn) => due.push(fn),
    clear: () => {},
  };
  return { timer, due };
}

describe("pollSchedule", () => {
  it("an ask that rejects is an unanswered one: the spent schedule says so", async () => {
    const clock = fakeClock();
    const r = recorder();
    pollSchedule(
      () => Promise.reject(new Error("gone")),
      clock.timer,
      r.judge,
      r.onEnd,
    );
    await clock.advance(LAST_MS);
    expect(r.judged).toEqual(END_POLL_MS.map(() => undefined));
    expect(r.ended).toEqual([false]);
  });

  it("a poll stopped while its ask travels neither judges nor ends", async () => {
    const clock = fakeClock();
    const r = recorder();
    let answer: (value: string) => void = () => {};
    const stop = pollSchedule(
      () =>
        new Promise<string>((resolve) => {
          answer = resolve;
        }),
      clock.timer,
      r.judge,
      r.onEnd,
    );
    await clock.advance(END_POLL_MS[0] ?? 0);
    stop();
    answer("late");
    await flush();
    expect(r.judged).toEqual([]);
    expect(r.ended).toEqual([]);
  });

  it("a timer that still fires after the stop asks nothing", async () => {
    const { timer, due } = stubbornTimer();
    const r = recorder();
    let asks = 0;
    const stop = pollSchedule(
      () => {
        asks += 1;
        return Promise.resolve("x");
      },
      timer,
      r.judge,
      r.onEnd,
    );
    stop();
    for (const fire of due) fire();
    await flush();
    expect(asks).toBe(0);
    expect(r.judged).toEqual([]);
  });
});
