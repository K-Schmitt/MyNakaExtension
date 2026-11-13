import { describe, expect, it } from "vitest";
import type { RetryFinish } from "../src/core/retry-finishes";
import { MAX_FINISHES_PER_WINDOW } from "../src/ext/finish-window";
import type { Settings } from "../src/ext/settings";
import { ScUnauthenticatedError } from "../src/sc/sc-errors";
import { retryNextJob } from "../src/sw/retry-job";
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

// The router's chain: a step is queued again while it answers true.
async function steps(w: ReturnType<typeof answerWorld>): Promise<boolean[]> {
  const answers: boolean[] = [];
  do {
    answers.push(await retryNextJob(w.jobDeps, SINCE));
  } while (answers[answers.length - 1] && answers.length < 10);
  return answers;
}

describe("retryNextJob", () => {
  it("handles only the first entry per step and answers true while more remain", async () => {
    const w = waitingWorld([entry(5), entry(6)]);
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(true);
    expect(doneCalls(w)).toEqual(["markDone:1005:2026-11-05"]);
    expect(w.state().retryFinishes?.map((e) => e.key)).toEqual(["movie:6"]);
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(w.state().retryFinishes).toBeUndefined();
  });

  it("answers false and keeps the entry when it keeps waiting", async () => {
    const w = waitingWorld([entry(5), entry(6)], {
      nakaAccount: () => undefined,
    });
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(w.state().retryFinishes).toHaveLength(2);
  });

  // In Chrome a sync often stamps its run in the very millisecond its retry was queued.
  it("retries after a run stamped at the exact time the step was queued", async () => {
    const w = waitingWorld([entry(5)], {
      settings: settingsWith(lastRun({ at: SINCE })),
    });
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(doneCalls(w)).toEqual(["markDone:1005:2026-11-05"]);
    expect(w.state().retryFinishes).toBeUndefined();
  });

  for (const [name, settings] of NOT_YET) {
    it(`does nothing when the last run ${name}`, async () => {
      const w = waitingWorld([entry(5)], { settings });
      await steps(w);
      expect(w.writes()).toEqual([]);
      expect(w.network()).toEqual([]);
      expect(w.state().retryFinishes).toHaveLength(1);
    });
  }

  it("answers false and writes nothing when the sync succeeded but no finish waits", async () => {
    const w = waitingWorld([]);
    expect(await retryNextJob(w.jobDeps, SINCE)).toBe(false);
    expect(w.writes()).toEqual([]);
    expect(w.network()).toEqual([]);
  });

  it("does nothing when no run was ever recorded", async () => {
    const w = waitingWorld([entry(5)], { settings: { mode: "live" } });
    await steps(w);
    expect(w.state().retryFinishes).toHaveLength(1);
  });

  it("retries each waiting finish in order and drops it when done", async () => {
    const w = waitingWorld([entry(5), entry(6)]);
    await steps(w);
    expect(doneCalls(w)).toEqual([
      "markDone:1005:2026-11-05",
      "markDone:1006:2026-11-05",
    ]);
    expect(w.state().retryFinishes).toBeUndefined();
    expect(w.state().handled).toEqual(["movie:5", "movie:6"]);
  });

  it("retries an episode key: the episode is marked seen and the entry dropped", async () => {
    const w = waitingWorld([entry(5, { key: "tv:5:S1E2" })], {
      naka: {
        contentById: async (id) => ({
          contentId: id,
          tmdbId: 9000 + id,
          mediaType: "tv",
          title: `Serie ${id}`,
          releaseDate: "2005-01-01",
        }),
      },
      product: (id) => ({ universe: id >= 5000 ? 32 : 4 }),
      sc: {
        seasonInfo: async (_id, season) => ({
          seasonProductId: 4005,
          episodes: [1, 2].map((e) => ({
            productId: 5000 + e,
            season,
            episode: e,
            title: `Episode ${e}`,
            average: null,
          })),
        }),
      },
    });
    await steps(w);
    expect(doneCalls(w)).toEqual(["markDone:5002:2026-11-05"]);
    expect(w.state().retryFinishes).toBeUndefined();
    expect(w.state().handled).toEqual(["tv:5:S1E2"]);
  });

  it("stops the batch at the first finish that keeps waiting", async () => {
    const w = waitingWorld([entry(5), entry(6)], {
      nakaAccount: () => undefined,
    });
    expect(await steps(w)).toEqual([false]);
    expect(doneCalls(w)).toEqual([]);
    expect(w.state().retryFinishes?.map((e) => e.key)).toEqual([
      "movie:5",
      "movie:6",
    ]);
    expect(w.nk.calls.filter((c) => c.startsWith("contentById:"))).toHaveLength(
      1,
    );
  });

  it("stops the batch when the hour's budget is full", async () => {
    const full = {
      ...settingsWith(),
      finishWindow: { from: NOW - 1000, count: MAX_FINISHES_PER_WINDOW },
    };
    const w = waitingWorld([entry(5), entry(6)], { settings: full });
    await steps(w);
    expect(doneCalls(w)).toEqual([]);
    expect(w.state().retryFinishes?.map((e) => e.key)).toEqual([
      "movie:5",
      "movie:6",
    ]);
    expect(w.settings().lastFinish).toMatchObject({ error: "finish-limit" });
  });

  it("keeps the entry and stops when the Naka tab changed page under the retry", async () => {
    // The content read pins the tab; it is still listed but no longer answers: naka-tab-changed.
    let sends = 0;
    const w = waitingWorld([entry(5), entry(6)], {
      tabs: (real) => ({
        query: real.query,
        send: async (tabId, msg) => {
          sends += 1;
          if (sends > 1) throw new Error("Could not establish connection.");
          return real.send(tabId, msg);
        },
      }),
    });
    expect(await steps(w)).toEqual([false]);
    expect(w.settings().lastFinish).toMatchObject({
      outcome: "failed",
      error: "naka-tab-changed",
    });
    expect(w.state().retryFinishes?.map((e) => e.key)).toEqual([
      "movie:5",
      "movie:6",
    ]);
    expect(w.writes()).toEqual([]);
  });

  it("drops an entry whose pair is no longer linked, without a finish", async () => {
    const w = answerWorld({
      state: stateWith({ retryFinishes: [entry(5)] }),
      settings: settingsWith(),
    });
    await steps(w);
    expect(w.state().retryFinishes).toBeUndefined();
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
    await steps(w);
    expect(w.state().retryFinishes).toBeUndefined();
    expect(w.writes()).toEqual([]);
  });

  it("drops an entry whose finish fails with sc-session", async () => {
    const w = waitingWorld([entry(5)], {
      sc: {
        productState: async () => Promise.reject(new ScUnauthenticatedError()),
      },
    });
    await steps(w);
    expect(w.state().retryFinishes).toBeUndefined();
    expect(w.settings().lastFinish).toMatchObject({ outcome: "failed" });
  });
});
