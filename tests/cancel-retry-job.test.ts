import { describe, expect, it } from "vitest";
import type { RetryFinish } from "../src/core/retry-finishes";
import type { Settings } from "../src/ext/settings";
import { cancelRetryJob } from "../src/sw/cancel-retry-job";
import { retryNextJob } from "../src/sw/retry-job";
import { answerWorld, BOUND, NOW } from "./answer-world";
import { cand, stateWith } from "./question-fixtures";

const question = {
  kind: "ambiguity" as const,
  side: "naka" as const,
  id: 5,
  title: "Titre 5",
  candidateIds: [1005, 2005],
  candidates: [cand(1005), cand(2005)],
};
const entry: RetryFinish = {
  key: "movie:5",
  pair: { nakaId: 5, scId: 1005 },
  evicted: [],
  question,
  at: NOW - 5000,
};
const settings: Settings = {
  mode: "live",
  binding: BOUND,
  lastRun: { at: NOW, trigger: "button", mode: "live", outcome: "ok" },
};
const waiting = () =>
  answerWorld({
    state: stateWith({ mapping: [entry.pair], retryFinishes: [entry] }),
    settings,
  });
const cancel = { type: "cancel-retry", contentId: 5 } as const;

describe("cancelRetryJob", () => {
  it("cancels the entry and saves", async () => {
    const w = waiting();
    await cancelRetryJob(w.jobDeps.store, cancel);
    expect(w.state().retryFinishes).toEqual([]);
    expect(w.state().mapping).toEqual([]);
    expect(w.state().pending).toHaveLength(1);
    expect(w.stateSaves()).toBe(1);
  });

  it("saves nothing for an unknown key", async () => {
    const w = waiting();
    await cancelRetryJob(w.jobDeps.store, { ...cancel, contentId: 9 });
    expect(w.stateSaves()).toBe(0);
    expect(w.state().retryFinishes).toHaveLength(1);
  });

  it("a cancel after a successful retry changes nothing", async () => {
    const w = waiting();
    await retryNextJob(w.jobDeps, NOW - 1000);
    const after = structuredClone(w.state());
    expect(after.retryFinishes).toEqual([]);
    await cancelRetryJob(w.jobDeps.store, cancel);
    expect(w.state()).toEqual(after);
    expect(w.state().handled).toEqual(["movie:5"]);
    expect(w.state().mapping).toEqual([entry.pair]);
  });
});
