import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import {
  addRetry,
  cancelRetry,
  dropRetry,
  MAX_RETRY_FINISHES,
  type RetryFinish,
  retriesOf,
} from "../src/core/retry-finishes";
import { emptyState, type SyncState } from "../src/core/state";

const p = (nakaId: number, scId: number): Pair => ({ nakaId, scId });

function entry(over: Partial<RetryFinish> = {}): RetryFinish {
  return {
    key: "movie:5",
    pair: p(5, 50),
    evicted: [],
    question: {
      kind: "ambiguity",
      side: "naka",
      id: 5,
      candidateIds: [50, 51],
    },
    at: 1,
    ...over,
  };
}

function linked(over: Partial<SyncState> = {}): SyncState {
  return {
    ...emptyState(),
    mapping: [p(5, 50)],
    snapshot: [p(5, 50)],
    retryLast: [p(5, 50)],
    ...over,
  };
}

const withEntry = (state: SyncState, e: RetryFinish): SyncState =>
  addRetry(state, e);

describe("retriesOf", () => {
  it("is empty when the state has no field", () => {
    expect(retriesOf(emptyState())).toEqual([]);
  });
});

describe("addRetry", () => {
  it("keeps one entry per key, the latest", () => {
    const one = addRetry(emptyState(), entry({ at: 1 }));
    const two = addRetry(one, entry({ at: 2 }));
    expect(retriesOf(two)).toHaveLength(1);
    expect(retriesOf(two)[0]?.at).toBe(2);
  });

  it("keeps the last 20", () => {
    let state = emptyState();
    for (let i = 1; i <= MAX_RETRY_FINISHES + 1; i += 1) {
      state = addRetry(state, entry({ key: `movie:${i}`, at: i }));
    }
    const keys = retriesOf(state).map((e) => e.key);
    expect(keys).toHaveLength(20);
    expect(keys[0]).toBe("movie:2");
    expect(keys[19]).toBe("movie:21");
  });
});

describe("dropRetry", () => {
  it("returns the same state when the key is absent", () => {
    const state = withEntry(emptyState(), entry());
    expect(dropRetry(state, "movie:9")).toBe(state);
  });

  it("removes the entry of the key", () => {
    const state = withEntry(emptyState(), entry());
    expect(retriesOf(dropRetry(state, "movie:5"))).toEqual([]);
  });

  it("dropping the last entry leaves no retryFinishes key", () => {
    const state = withEntry(emptyState(), entry());
    expect("retryFinishes" in dropRetry(state, "movie:5")).toBe(false);
  });

  it("keeps the field while another entry waits", () => {
    const state = withEntry(
      withEntry(emptyState(), entry()),
      entry({ key: "movie:6" }),
    );
    expect(retriesOf(dropRetry(state, "movie:5")).map((e) => e.key)).toEqual([
      "movie:6",
    ]);
  });
});

describe("cancelRetry", () => {
  it("undoes the link and asks again", () => {
    const e = entry();
    const after = cancelRetry(withEntry(linked(), e), "movie:5");
    expect(after?.mapping).toEqual([]);
    expect(after?.snapshot).toEqual([]);
    expect(after?.retryLast).toEqual([]);
    expect(after?.pending.at(-1)).toEqual(e.question);
    expect(retriesOf(after as SyncState)).toEqual([]);
  });

  // A « garder » given on the pair while the finish waited is undone with the link.
  it("forgets the pair's settled mark, and only that one", () => {
    const state = withEntry(linked({ settled: [p(5, 50), p(9, 90)] }), entry());
    const after = cancelRetry(state, "movie:5");
    expect(after?.settled).toEqual([p(9, 90)]);
  });

  it("keeps the settled mark of a link made before the answer", () => {
    const state = withEntry(
      linked({ settled: [p(5, 50)] }),
      entry({ linkedBefore: true }),
    );
    expect(cancelRetry(state, "movie:5")?.settled).toEqual([p(5, 50)]);
  });

  it("restores an evicted link", () => {
    const e = entry({ evicted: [p(7, 70)] });
    const after = cancelRetry(withEntry(linked(), e), "movie:5");
    expect(after?.mapping).toEqual([p(7, 70)]);
  });

  it("does not restore an evicted link that conflicts with a later one", () => {
    const e = entry({ evicted: [p(7, 70)] });
    const state = withEntry(linked({ mapping: [p(5, 50), p(7, 99)] }), e);
    const after = cancelRetry(state, "movie:5");
    expect(after?.mapping).toEqual([p(7, 99)]);
  });

  it("does not restore an evicted link whose sc id a later link took", () => {
    const e = entry({ evicted: [p(7, 70)] });
    const state = withEntry(linked({ mapping: [p(5, 50), p(8, 70)] }), e);
    const after = cancelRetry(state, "movie:5");
    expect(after?.mapping).toEqual([p(8, 70)]);
  });

  it("only drops the entry when the pair is no longer linked", () => {
    const state = withEntry(
      linked({ mapping: [], snapshot: [p(1, 2)], retryLast: [] }),
      entry(),
    );
    const after = cancelRetry(state, "movie:5");
    expect(after?.mapping).toEqual([]);
    expect(after?.snapshot).toEqual([p(1, 2)]);
    expect(after?.pending).toEqual([]);
    expect(retriesOf(after as SyncState)).toEqual([]);
  });

  it("does not add the question twice", () => {
    const e = entry();
    const state = withEntry(linked({ pending: [{ ...e.question }] }), e);
    expect(cancelRetry(state, "movie:5")?.pending).toHaveLength(1);
  });

  it("cancelRetry keeps a link made before the answer", () => {
    const e = entry({ linkedBefore: true });
    const state = withEntry(linked(), e);
    const after = cancelRetry(state, "movie:5");
    expect(after?.mapping).toEqual([p(5, 50)]);
    expect(after?.snapshot).toEqual([p(5, 50)]);
    expect(after?.retryLast).toEqual([p(5, 50)]);
    expect(after?.pending).toEqual([e.question]);
    expect(retriesOf(after as SyncState)).toEqual([]);
  });

  it("cancelRetry with a linkedBefore entry whose pair left the mapping only drops the entry", () => {
    const state = withEntry(
      linked({ mapping: [], snapshot: [], retryLast: [] }),
      entry({ linkedBefore: true }),
    );
    const after = cancelRetry(state, "movie:5");
    expect(after?.pending).toEqual([]);
    expect(retriesOf(after as SyncState)).toEqual([]);
    expect("retryFinishes" in (after as SyncState)).toBe(false);
  });

  it("a cancel on a title already handled only removes the entry", () => {
    const state = withEntry(linked({ handled: ["movie:5"] }), entry());
    const after = cancelRetry(state, "movie:5");
    expect(after?.mapping).toEqual([p(5, 50)]);
    expect(after?.snapshot).toEqual([p(5, 50)]);
    expect(after?.pending).toEqual([]);
    expect(retriesOf(after as SyncState)).toEqual([]);
  });

  it("a cancel on a handled linkedBefore entry asks nothing", () => {
    const state = withEntry(
      linked({ handled: ["movie:5"] }),
      entry({ linkedBefore: true }),
    );
    expect(cancelRetry(state, "movie:5")?.pending).toEqual([]);
  });

  it("is undefined for an unknown key", () => {
    expect(cancelRetry(linked(), "movie:5")).toBeUndefined();
  });
});
