import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pair } from "../src/core/list-diff";
import { emptyState, markAsked, type SyncState } from "../src/core/state";
import type { Candidate, Titled } from "../src/core/title-match";

vi.mock("../src/core/resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/resolver")>();
  return {
    ...actual,
    resolveNakaIds: vi.fn(actual.resolveNakaIds),
    resolveScIds: vi.fn(actual.resolveScIds),
  };
});

import { resolveNakaIds, resolveScIds } from "../src/core/resolver";
import {
  MAX_RESOLVE_PER_RUN,
  MAX_WRITES_PER_RUN,
  runSync,
  type SyncPorts,
  type SyncReport,
} from "../src/core/sync-runner";

const p = (n: number): Pair => ({ nakaId: n, scId: n + 1000 });
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const pairs = (from: number, to: number): Pair[] => range(from, to).map(p);

const film = (n: number): Titled => ({
  title: `Film ${n}`,
  year: 2000,
  type: "film",
});
const cand = (n: number, id: number): Candidate => ({ id, ...film(n) });
const numberOf = (q: string): number => Number(q.replace("Film ", ""));

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

type Opts = {
  naka?: number[];
  sc?: number[];
  state?: SyncState;
  failSc?: number[];
  failNaka?: number[];
  failLoad?: boolean;
  failSave?: boolean;
  noEffectSc?: boolean;
  noEffectNaka?: boolean;
  nakaReadFails?: number[];
  scReadFails?: number[];
};

function world(o: Opts = {}) {
  const w = {
    naka: new Set(o.naka ?? []),
    sc: new Set(o.sc ?? []),
    state: o.state ?? emptyState(),
    writes: [] as string[],
    saved: [] as SyncState[],
    nakaReads: 0,
    scReads: 0,
    describes: [] as string[],
    ports: undefined as unknown as SyncPorts,
  };
  w.ports = {
    load: async () => {
      if (o.failLoad) throw new Error("load");
      return w.state;
    },
    save: async (s) => {
      if (o.failSave) throw new Error("save");
      w.saved.push(s);
      w.state = s;
    },
    nakaIds: async () => {
      w.nakaReads += 1;
      if (o.nakaReadFails?.includes(w.nakaReads)) throw new Error("naka read");
      return [...w.naka];
    },
    scWishlistIds: async () => {
      w.scReads += 1;
      if (o.scReadFails?.includes(w.scReads)) throw new Error("sc read");
      return [...w.sc];
    },
    addToSc: async (scId) => {
      w.writes.push(`addToSc:${scId}`);
      if (o.failSc?.includes(scId)) throw new Error("sc write");
      if (!o.noEffectSc) w.sc.add(scId);
    },
    addToNaka: async (nakaId) => {
      w.writes.push(`addToNaka:${nakaId}`);
      if (o.failNaka?.includes(nakaId)) throw "plain failure";
      if (!o.noEffectNaka) w.naka.add(nakaId);
    },
    describeNaka: async (id) => {
      w.describes.push(`naka:${id}`);
      return film(id);
    },
    describeSc: async (id) => {
      w.describes.push(`sc:${id}`);
      return film(id - 1000);
    },
    searchSc: async (q) => [cand(numberOf(q), numberOf(q) + 1000)],
    searchNaka: async (q) => [cand(numberOf(q), numberOf(q))],
  };
  return w;
}

const withMapping = (mapping: Pair[], extra: Partial<SyncState> = {}) => ({
  ...emptyState(),
  mapping,
  ...extra,
});

const report = (r: Partial<SyncReport> = {}): SyncReport => ({
  added: [],
  deferred: [],
  failed: [],
  pendingRemovals: 0,
  unresolved: 0,
  ...r,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("constants", () => {
  it("pins the caps", () => {
    expect(MAX_WRITES_PER_RUN).toBe(10);
    expect(MAX_RESOLVE_PER_RUN).toBe(20);
  });
});

describe("write cap", () => {
  it("writes 10 of 25 known Naka-only titles, defers 15, snapshots the 10", async () => {
    const w = world({ naka: range(1, 25), state: withMapping(pairs(1, 25)) });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(range(1, 10).map((n) => `addToSc:${n + 1000}`));
    expect(r).toEqual(report({ added: pairs(1, 10), deferred: pairs(11, 25) }));
    expect(w.saved).toHaveLength(1);
    expect(w.saved[0]?.snapshot).toEqual(pairs(1, 10));
    expect(w.saved[0]?.pending).toEqual([]);
  });

  it("the second run writes the next 10, none twice, none skipped", async () => {
    const w = world({ naka: range(1, 25), state: withMapping(pairs(1, 25)) });
    await runSync(w.ports);
    w.writes.length = 0;
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(range(11, 20).map((n) => `addToSc:${n + 1000}`));
    expect(r).toEqual(
      report({ added: pairs(11, 20), deferred: pairs(21, 25) }),
    );
    expect(w.saved[1]?.snapshot).toEqual(pairs(1, 20));
  });

  it("mixes addToSc then addToNaka within one cap", async () => {
    const w = world({
      naka: range(1, 8),
      sc: range(1011, 1018),
      state: withMapping([...pairs(1, 8), ...pairs(11, 18)]),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([
      ...range(1, 8).map((n) => `addToSc:${n + 1000}`),
      "addToNaka:11",
      "addToNaka:12",
    ]);
    expect(r.deferred).toEqual(pairs(13, 18));
    expect(r.added).toEqual([...pairs(1, 8), ...pairs(11, 12)]);
  });
});

describe("removals and D1", () => {
  const removalState = (): SyncState =>
    withMapping([p(1)], { snapshot: [p(1)] });

  it("queues a removal without writing", async () => {
    const w = world({ naka: [1], state: removalState() });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(r).toEqual(report({ pendingRemovals: 1 }));
    expect(w.saved[0]?.pending).toEqual([
      { kind: "removal", removeFrom: "naka", pair: p(1), asked: false },
    ]);
    expect(w.saved[0]?.snapshot).toEqual([]);
  });

  it("queues removeFrom sc when the title left Naka", async () => {
    const w = world({ sc: [1001], state: removalState() });
    await runSync(w.ports);
    expect(w.saved[0]?.pending).toEqual([
      { kind: "removal", removeFrom: "sc", pair: p(1), asked: false },
    ]);
  });

  it("never re-adds an unanswered removal over three runs (D1)", async () => {
    const w = world({ naka: [1], state: removalState() });
    const r1 = await runSync(w.ports);
    const r2 = await runSync(w.ports);
    expect(w.saved[1]?.pending).toHaveLength(1);
    w.state = markAsked(w.state, p(1));
    const r3 = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(w.saved).toHaveLength(3);
    expect(w.saved[2]?.pending).toEqual([
      { kind: "removal", removeFrom: "naka", pair: p(1), asked: true },
    ]);
    expect(w.saved[2]?.snapshot).toEqual([]);
    expect(r1).toEqual(report({ pendingRemovals: 1 }));
    expect(r2).toEqual(report({ pendingRemovals: 1 }));
    expect(r3).toEqual(report({ pendingRemovals: 0 }));
  });

  it("does not queue a removal for a settled pair", async () => {
    const w = world({
      naka: [1],
      state: withMapping([p(1)], { snapshot: [p(1)], settled: [p(1)] }),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(r).toEqual(report());
    expect(w.saved[0]?.pending).toEqual([]);
  });

  it("does not add a settled pair absent from the snapshot", async () => {
    const w = world({
      naka: [1],
      state: withMapping([p(1)], { settled: [p(1)] }),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(r).toEqual(report());
  });

  it("does not duplicate a removal already pending", async () => {
    const pending = {
      kind: "removal",
      removeFrom: "naka",
      pair: p(1),
      asked: true,
    } as const;
    const w = world({
      naka: [1],
      state: withMapping([p(1)], { snapshot: [p(1)], pending: [pending] }),
    });
    await runSync(w.ports);
    expect(w.saved[0]?.pending).toEqual([pending]);
  });
});

describe("fail closed (D2)", () => {
  const live = () => withMapping([p(1)], { snapshot: [p(1)] });

  it("rejects when load rejects, calling nothing else", async () => {
    const w = world({ failLoad: true, state: live() });
    await expect(runSync(w.ports)).rejects.toThrow("load");
    expect([w.nakaReads, w.scReads, w.writes.length, w.saved.length]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("rejects when the Naka list is unreadable", async () => {
    const w = world({ sc: [1001], nakaReadFails: [1], state: live() });
    await expect(runSync(w.ports)).rejects.toThrow("naka read");
    expect([w.writes.length, w.saved.length]).toEqual([0, 0]);
    expect(resolveNakaIds).not.toHaveBeenCalled();
  });

  it("rejects when the SensCritique list is unreadable", async () => {
    const w = world({ naka: [1], scReadFails: [1], state: live() });
    await expect(runSync(w.ports)).rejects.toThrow("sc read");
    expect([w.writes.length, w.saved.length]).toEqual([0, 0]);
    expect(resolveScIds).not.toHaveBeenCalled();
  });

  it("rejects when save rejects", async () => {
    const w = world({ failSave: true });
    await expect(runSync(w.ports)).rejects.toThrow("save");
  });

  it("an empty state with empty lists writes nothing and saves emptyState()", async () => {
    const w = world();
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(w.saved).toEqual([emptyState()]);
    expect(r).toEqual(report());
  });
});

describe("resolution (D2 step 3)", () => {
  it("passes the first 20 of 30 unresolved Naka ids, one call per side", async () => {
    const w = world({ naka: range(1, 30) });
    const r = await runSync(w.ports);
    expect(resolveNakaIds).toHaveBeenCalledTimes(1);
    expect(resolveScIds).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveNakaIds).mock.calls[0]?.[0]).toEqual(range(1, 20));
    expect(w.describes).toEqual(range(1, 20).map((n) => `naka:${n}`));
    expect(r).toEqual(
      report({ added: pairs(1, 10), deferred: pairs(11, 20), unresolved: 10 }),
    );
    expect(w.saved[0]?.mapping).toEqual(pairs(1, 20));
    expect(w.saved[0]?.snapshot).toEqual(pairs(1, 10));
  });

  it("resolves SensCritique ids and adds them to Naka", async () => {
    const w = world({ sc: [1001, 1002] });
    const r = await runSync(w.ports);
    expect(vi.mocked(resolveScIds).mock.calls[0]?.[0]).toEqual([1001, 1002]);
    expect(w.writes).toEqual(["addToNaka:1", "addToNaka:2"]);
    expect(r).toEqual(report({ added: pairs(1, 2) }));
  });

  it("caps the SensCritique ids at 20 too", async () => {
    const w = world({ sc: range(1001, 1030) });
    await runSync(w.ports);
    expect(vi.mocked(resolveScIds).mock.calls[0]?.[0]).toEqual(
      range(1001, 1020),
    );
  });

  it("calls the resolver once per side even with nothing to resolve", async () => {
    const w = world({ naka: [1], sc: [1001], state: withMapping([p(1)]) });
    await runSync(w.ports);
    expect(resolveNakaIds).toHaveBeenCalledTimes(1);
    expect(resolveScIds).toHaveBeenCalledTimes(1);
  });
});

describe("failing writes (D2 step 5)", () => {
  it("stops that side after a failure, continues the other side", async () => {
    const w = world({
      naka: range(1, 5),
      sc: [1011, 1012],
      failSc: [1003],
      state: withMapping([...pairs(1, 5), ...pairs(11, 12)]),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([
      "addToSc:1001",
      "addToSc:1002",
      "addToSc:1003",
      "addToNaka:11",
      "addToNaka:12",
    ]);
    expect(r).toEqual(
      report({
        added: [p(1), p(2), p(11), p(12)],
        failed: [p(3)],
        deferred: [p(4), p(5)],
      }),
    );
    expect(w.saved).toHaveLength(1);
    expect(w.saved[0]?.snapshot).toEqual([p(1), p(2), p(11), p(12)]);
  });

  it("a non-Error rejection on Naka stops Naka writes, not SensCritique ones", async () => {
    const w = world({
      naka: [1],
      sc: [1011, 1012],
      failNaka: [11],
      state: withMapping([p(1), p(11), p(12)]),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToNaka:11"]);
    expect(r).toEqual(
      report({ added: [p(1)], failed: [p(11)], deferred: [p(12)] }),
    );
  });

  it("a failed attempt still counts against the cap", async () => {
    const w = world({
      naka: range(1, 12),
      failSc: [1001],
      state: withMapping(pairs(1, 12)),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1001"]);
    expect(r.deferred).toEqual(pairs(2, 12));
  });
});

describe("snapshot from what the sites hold (D2 step 7)", () => {
  const base = () => withMapping([p(9), p(1)], { snapshot: [p(9)] });

  it("keeps out a write that resolved without taking effect", async () => {
    const w = world({
      naka: [9, 1],
      sc: [1009],
      noEffectSc: true,
      state: base(),
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ added: [p(1)] }));
    expect(w.saved[0]?.snapshot).toEqual([p(9)]);
    expect(w.scReads).toBe(2);
    expect(w.nakaReads).toBe(1);
  });

  it("re-reads Naka only after a successful Naka write", async () => {
    const w = world({ naka: [9], sc: [1009, 1001], state: base() });
    await runSync(w.ports);
    expect(w.writes).toEqual(["addToNaka:1"]);
    expect(w.nakaReads).toBe(2);
    expect(w.scReads).toBe(1);
    expect(w.saved[0]?.snapshot).toEqual([p(9), p(1)]);
  });

  it("uses the original list when the re-read rejects", async () => {
    const w = world({
      naka: [9, 1],
      sc: [1009],
      scReadFails: [2],
      state: base(),
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ added: [p(1)] }));
    expect(w.saved[0]?.snapshot).toEqual([p(9)]);
  });

  it("does not re-read when no write succeeded", async () => {
    const w = world({
      naka: [9, 1],
      sc: [1009],
      failSc: [1001],
      state: base(),
    });
    await runSync(w.ports);
    expect([w.nakaReads, w.scReads]).toEqual([1, 1]);
    expect(w.saved[0]?.snapshot).toEqual([p(9)]);
  });

  it("snapshots only pairs present in both lists", async () => {
    const w = world({
      naka: [1, 2],
      sc: [1001, 1003],
      state: withMapping([p(1), p(2), p(3)], { settled: [p(2), p(3)] }),
    });
    await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(w.saved[0]?.snapshot).toEqual([p(1)]);
  });
});

describe("purity (D4)", () => {
  it("does not mutate a deep-frozen loaded state", async () => {
    const w = world({
      naka: [1, 2],
      state: deepFreeze(withMapping([p(1), p(2)], { snapshot: [p(2)] })),
    });
    const r = await runSync(w.ports);
    expect(r.added).toEqual([p(1)]);
    expect(r.pendingRemovals).toBe(1);
  });
});
