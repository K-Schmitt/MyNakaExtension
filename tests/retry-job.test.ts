import { describe, expect, it } from "vitest";
import type { RetryFinish } from "../src/core/retry-finishes";
import type { Settings } from "../src/ext/settings";
import { ScUnauthenticatedError } from "../src/sc/sc-errors";
import { retryFinishesJob } from "../src/sw/retry-job";
import { answerWorld, BOUND, NOW } from "./answer-world";
import { cand, stateWith } from "./question-fixtures";

const SINCE = NOW - 1000;
const question = {
  kind: "ambiguity" as const,
  side: "naka" as const,
  id: 5,
  title: "Titre 5",
  candidateIds: [1005, 2005],
  candidates: [cand(1005), cand(2005)],
};
const entry = (id: number, over: Partial<RetryFinish> = {}): RetryFinish => ({
  key: `movie:${id}`,
  pair: { nakaId: id, scId: 1000 + id },
  evicted: [],
  question: { ...question, id },
  at: NOW - 5000,
  ...over,
});
const lastRun = (over: Partial<NonNullable<Settings["lastRun"]>> = {}) => ({
  at: NOW,
  trigger: "button" as const,
  mode: "live" as const,
  outcome: "ok" as const,
  ...over,
});
const settingsWith = (run: Settings["lastRun"] = lastRun()): Settings => ({
  mode: "live",
  binding: BOUND,
  lastRun: run,
});
const waitingWorld = (
  entries: RetryFinish[],
  over: Parameters<typeof answerWorld>[0] = {},
) =>
  answerWorld({
    state: stateWith({
      mapping: entries.map((e) => e.pair),
      retryFinishes: entries,
    }),
    settings: settingsWith(),
    ...over,
  });
const doneCalls = (w: ReturnType<typeof answerWorld>) =>
  w.sk.calls.filter((c) => c.startsWith("markDone:"));
const NOT_YET = [
  ["is older than since", settingsWith(lastRun({ at: SINCE - 1 }))],
  ["failed", settingsWith(lastRun({ outcome: "failed" }))],
  ["is ok with an error", settingsWith(lastRun({ error: "no-naka-tab" }))],
] as const;

describe("retryFinishesJob", () => {
  for (const [name, settings] of NOT_YET) {
    it(`does nothing when the last run ${name}`, async () => {
      const w = waitingWorld([entry(5)], { settings });
      await retryFinishesJob(w.jobDeps, SINCE);
      expect(w.writes()).toEqual([]);
      expect(w.network()).toEqual([]);
      expect(w.state().retryFinishes).toHaveLength(1);
    });
  }

  it("does nothing when no run was ever recorded", async () => {
    const w = waitingWorld([entry(5)], { settings: { mode: "live" } });
    await retryFinishesJob(w.jobDeps, SINCE);
    expect(w.state().retryFinishes).toHaveLength(1);
  });

  it("retries each waiting finish in order and drops it when done", async () => {
    const w = waitingWorld([entry(5), entry(6)]);
    await retryFinishesJob(w.jobDeps, SINCE);
    expect(doneCalls(w)).toEqual([
      "markDone:1005:2026-11-05",
      "markDone:1006:2026-11-05",
    ]);
    expect(w.state().retryFinishes).toEqual([]);
    expect(w.state().handled).toEqual(["movie:5", "movie:6"]);
  });

  it("stops the batch at the first finish that keeps waiting", async () => {
    const w = waitingWorld([entry(5), entry(6)], {
      nakaAccount: () => undefined,
    });
    await retryFinishesJob(w.jobDeps, SINCE);
    expect(doneCalls(w)).toEqual([]);
    expect(w.state().retryFinishes?.map((e) => e.key)).toEqual([
      "movie:5",
      "movie:6",
    ]);
    expect(w.nk.calls.filter((c) => c.startsWith("contentById:"))).toHaveLength(
      1,
    );
  });

  it("drops an entry whose pair is no longer linked, without a finish", async () => {
    const w = answerWorld({
      state: stateWith({ retryFinishes: [entry(5)] }),
      settings: settingsWith(),
    });
    await retryFinishesJob(w.jobDeps, SINCE);
    expect(w.state().retryFinishes).toEqual([]);
    expect(w.network()).toEqual([]);
  });

  it("drops an entry the pre-check finds handled", async () => {
    const w = answerWorld({
      state: stateWith({
        mapping: [entry(5).pair],
        handled: ["movie:5"],
        retryFinishes: [entry(5)],
      }),
      settings: settingsWith(),
    });
    await retryFinishesJob(w.jobDeps, SINCE);
    expect(w.state().retryFinishes).toEqual([]);
    expect(w.writes()).toEqual([]);
  });

  it("drops an entry whose finish fails with sc-session", async () => {
    const w = waitingWorld([entry(5)], {
      sc: {
        productState: async () => Promise.reject(new ScUnauthenticatedError()),
      },
    });
    await retryFinishesJob(w.jobDeps, SINCE);
    expect(w.state().retryFinishes).toEqual([]);
    expect(w.settings().lastFinish).toMatchObject({ outcome: "failed" });
  });
});
