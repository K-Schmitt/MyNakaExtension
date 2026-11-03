import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import { emptyState, type SyncState } from "../src/core/state";
import {
  runSync,
  type SyncPorts,
  type SyncReport,
} from "../src/core/sync-runner";

// A film on the Naka list that the owner already saw (and maybe rated) on SensCritique is never wished:
// what SensCritique would do to its done state or rating is unknown. addToSc answers "already-done",
// and the runner settles the pair and reports it.

const p = (n: number): Pair => ({ nakaId: n, scId: n + 1000 });
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const pairs = (from: number, to: number): Pair[] => range(from, to).map(p);

type Reply = "added" | "already-done" | "fail" | unknown;

function world(o: {
  naka: number[];
  state: SyncState;
  reply: (scId: number) => Reply;
}) {
  const w = {
    naka: new Set(o.naka),
    sc: new Set<number>(),
    state: o.state,
    writes: [] as string[],
    scReads: 0,
  };
  const ports: SyncPorts = {
    load: async () => w.state,
    save: async (state) => {
      w.state = state;
    },
    nakaIds: async () => [...w.naka],
    scWishlistIds: async () => {
      w.scReads += 1;
      return [...w.sc];
    },
    addToSc: async (scId) => {
      w.writes.push(`addToSc:${scId}`);
      const reply = o.reply(scId);
      if (reply === "fail") throw new Error("sc write");
      if (reply === "added") w.sc.add(scId);
      return reply as "added";
    },
    addToNaka: async (nakaId) => {
      w.writes.push(`addToNaka:${nakaId}`);
      w.naka.add(nakaId);
    },
    describeNaka: async () => undefined,
    describeSc: async () => undefined,
    searchNaka: async () => [],
    searchSc: async () => [],
  };
  return { w, ports };
}

const mapped = (mapping: Pair[], extra: Partial<SyncState> = {}) => ({
  ...emptyState(),
  mapping,
  ...extra,
});

const report = (r: Partial<SyncReport> = {}): SyncReport => ({
  added: [],
  deferred: [],
  failed: [],
  alreadyDone: [],
  pendingRemovals: 0,
  unresolved: 0,
  ...r,
});

describe("a product already done on SensCritique", () => {
  it("is settled, reported, never attempted again and not re-read", async () => {
    const { w, ports } = world({
      naka: [1, 2],
      state: mapped(pairs(1, 2)),
      reply: (id) => (id === 1001 ? "already-done" : "added"),
    });
    const r1 = await runSync(ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToSc:1002"]);
    expect(r1).toEqual(report({ added: [p(2)], alreadyDone: [p(1)] }));
    expect(w.state.settled).toEqual([p(1)]);
    expect(w.state.retryLast).toEqual([]);
    expect(w.state.snapshot).toEqual([p(2)]);
    expect(w.scReads).toBe(2);
    const r2 = await runSync(ports);
    const r3 = await runSync(ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToSc:1002"]);
    expect(r2).toEqual(report());
    expect(r3).toEqual(report());
  });

  it("is not a write: a run with only already-done answers re-reads nothing", async () => {
    const { w, ports } = world({
      naka: [1],
      state: mapped([p(1)]),
      reply: () => "already-done",
    });
    const r = await runSync(ports);
    expect(r).toEqual(report({ alreadyDone: [p(1)] }));
    expect(w.scReads).toBe(1);
    expect(w.state.snapshot).toEqual([]);
  });

  it("resets the consecutive failures: fail, done, fail, then the fourth is still attempted", async () => {
    const replies: Record<number, Reply> = {
      1001: "fail",
      1002: "already-done",
      1003: "fail",
      1004: "added",
    };
    const { w, ports } = world({
      naka: range(1, 4),
      state: mapped(pairs(1, 4)),
      reply: (id) => replies[id],
    });
    const r = await runSync(ports);
    expect(w.writes).toEqual(range(1001, 1004).map((id) => `addToSc:${id}`));
    expect(r).toEqual(
      report({ added: [p(4)], failed: [p(1), p(3)], alreadyDone: [p(2)] }),
    );
    expect(w.state.retryLast).toEqual([p(1), p(3)]);
  });

  it("counts as an attempt against the cap of 10", async () => {
    const { w, ports } = world({
      naka: range(1, 12),
      state: mapped(pairs(1, 12)),
      reply: (id) => (id <= 1003 ? "already-done" : "added"),
    });
    const r = await runSync(ports);
    expect(w.writes).toHaveLength(10);
    expect(r).toEqual(
      report({
        added: pairs(4, 10),
        alreadyDone: pairs(1, 3),
        deferred: pairs(11, 12),
      }),
    );
  });

  it("leaves retryLast", async () => {
    const { w, ports } = world({
      naka: [1],
      state: mapped([p(1)], { retryLast: [p(1)] }),
      reply: () => "already-done",
    });
    const r = await runSync(ports);
    expect(r).toEqual(report({ alreadyDone: [p(1)] }));
    expect(w.state.retryLast).toEqual([]);
    expect(w.state.settled).toEqual([p(1)]);
  });

  it.each([
    ["undefined", undefined],
    ["another string", "done"],
    ["an object", { state: "added" }],
    ["true", true],
  ])("an answer of %s fails closed as a failed write", async (_n, reply) => {
    const { w, ports } = world({
      naka: [1, 2],
      state: mapped(pairs(1, 2)),
      reply: () => reply,
    });
    const r = await runSync(ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToSc:1002"]);
    expect(r).toEqual(report({ failed: pairs(1, 2) }));
    expect(w.state.settled).toEqual([]);
    expect(w.state.retryLast).toEqual(pairs(1, 2));
    expect(w.scReads).toBe(1);
  });

  it("an already-done pair in the snapshot stays there while it is on Naka", async () => {
    const { w, ports } = world({
      naka: [1],
      state: mapped([p(1)], { snapshot: [p(1)], settled: [] }),
      reply: () => "already-done",
    });
    // The pair was synced and the owner removed 1001: a removal question, never a write.
    const r = await runSync(ports);
    expect(w.writes).toEqual([]);
    expect(r).toEqual(report({ pendingRemovals: 1 }));
  });
});
