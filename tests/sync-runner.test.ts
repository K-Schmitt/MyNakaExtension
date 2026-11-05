import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pair } from "../src/core/list-diff";
import {
  emptyState,
  markAsked,
  type PendingItem,
  resolvePending,
  type SyncState,
  settlePair,
  type UnlinkedItem,
  upsertMapping,
} from "../src/core/state";
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
  afterNaka?: (naka: Set<number>) => void;
  unknownNaka?: number[];
  scTitle?: Record<number, number>;
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
      return "added";
    },
    addToNaka: async (nakaId) => {
      w.writes.push(`addToNaka:${nakaId}`);
      if (o.failNaka?.includes(nakaId)) throw "plain failure";
      if (!o.noEffectNaka) w.naka.add(nakaId);
      o.afterNaka?.(w.naka);
    },
    describeNaka: async (id) => {
      w.describes.push(`naka:${id}`);
      return o.unknownNaka?.includes(id) ? undefined : film(id);
    },
    describeSc: async (id) => {
      w.describes.push(`sc:${id}`);
      return film(o.scTitle?.[id] ?? id - 1000);
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
  alreadyDone: [],
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
    expect(r).toEqual(
      report({
        added: [...pairs(1, 8), ...pairs(11, 12)],
        deferred: pairs(13, 18),
      }),
    );
  });
});

describe("removals and D1", () => {
  const removalState = (): SyncState =>
    withMapping([p(1)], { snapshot: [p(1)] });

  it("queues a removal without writing and keeps the pair in the snapshot (R2)", async () => {
    const w = world({ naka: [1], state: removalState() });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(r).toEqual(report({ pendingRemovals: 1 }));
    expect(w.saved[0]?.pending).toEqual([
      {
        kind: "removal",
        removeFrom: "naka",
        pair: p(1),
        asked: false,
        title: "Film 1",
      },
    ]);
    expect(w.saved[0]?.snapshot).toEqual([p(1)]);
  });

  it("queues removeFrom sc when the title left Naka", async () => {
    const w = world({ sc: [1001], state: removalState() });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ pendingRemovals: 1 }));
    expect(w.saved[0]?.pending).toEqual([
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(1),
        asked: false,
        title: "Film 1",
      },
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
      {
        kind: "removal",
        removeFrom: "naka",
        pair: p(1),
        asked: true,
        title: "Film 1",
      },
    ]);
    expect(w.saved[2]?.snapshot).toEqual([p(1)]);
    expect(r1).toEqual(report({ pendingRemovals: 1 }));
    expect(r2).toEqual(report({ pendingRemovals: 1 }));
    expect(r3).toEqual(report({ pendingRemovals: 0 }));
  });

  it("after the question is answered 'remove' without the title leaving, asks again and never adds (R2, probe D)", async () => {
    const w = world({ naka: [1], state: removalState() });
    const r1 = await runSync(w.ports);
    w.sc.add(1001);
    const r2 = await runSync(w.ports);
    w.naka.delete(1);
    const r3 = await runSync(w.ports);
    expect(w.state.pending).toEqual([
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(1),
        asked: false,
        title: "Film 1",
      },
    ]);
    w.state = resolvePending(w.state, w.state.pending[0] as PendingItem);
    const r4 = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(w.state.pending).toEqual([
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(1),
        asked: false,
        title: "Film 1",
      },
    ]);
    expect(r1).toEqual(report({ pendingRemovals: 1 }));
    // Both lists hold the pair at run 2: the removal is moot and closed (B3), then re-asked from the other side.
    expect(r2).toEqual(report({ pendingRemovals: 0 }));
    expect(r3).toEqual(report({ pendingRemovals: 1 }));
    expect(r4).toEqual(report({ pendingRemovals: 1 }));
  });

  it("a remap while the removal is pending writes nothing (D1 as a write guard)", async () => {
    // SC 1777 is a second product titled "Film 1": the resolver raises an
    // ambiguity (Naka 1 is held by P); the owner answers it in Plan 3.
    const w = world({
      sc: [1001, 1777],
      scTitle: { 1777: 1 },
      state: withMapping([p(1)], { snapshot: [p(1)] }),
    });
    const r1 = await runSync(w.ports);
    expect(r1).toEqual(report({ pendingRemovals: 1 }));
    const ambiguity = w.state.pending.find((i) => i.kind === "ambiguity");
    if (!ambiguity) throw new Error("expected an ambiguity");
    w.state = resolvePending(
      upsertMapping(w.state, { nakaId: 1, scId: 1777 }),
      ambiguity,
    );
    const r2 = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(r2).toEqual(report({ pendingRemovals: 1 }));
    expect(w.state.pending).toEqual([
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(1),
        asked: false,
        title: "Film 1",
      },
      {
        kind: "ambiguity",
        side: "sc",
        id: 1001,
        candidateIds: [1],
        title: "Film 1",
        candidates: [{ id: 1, title: "Film 1", year: 2000, type: "film" }],
      },
    ]);
  });

  it("a conflicted snapshot pair is not re-added once the conflict clears (probe N)", async () => {
    const q = { nakaId: 1, scId: 1777 };
    const w = world({
      sc: [1001, 1777],
      scTitle: { 1777: 1 },
      state: withMapping([p(1)], { snapshot: [p(1)] }),
    });
    const r1 = await runSync(w.ports);
    const ambiguity = w.state.pending.find(
      (i) => i.kind === "ambiguity" && i.id === 1777,
    );
    if (!ambiguity) throw new Error("expected an ambiguity");
    w.state = resolvePending(upsertMapping(w.state, q), ambiguity);
    w.naka.add(1);
    const r2 = await runSync(w.ports);
    expect(w.state.snapshot).toEqual([q, p(1)]);
    w.sc.delete(1777);
    const r3 = await runSync(w.ports);
    const removal = w.state.pending.find(
      (i) => i.kind === "removal" && i.pair.scId === 1001,
    );
    if (!removal) throw new Error("expected the first removal");
    w.sc.delete(1001);
    w.state = resolvePending(w.state, removal);
    const r4 = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(w.state.pending.filter((i) => i.kind === "removal")).toEqual([
      {
        kind: "removal",
        removeFrom: "naka",
        pair: q,
        asked: false,
        title: "Film 1",
      },
    ]);
    expect(r1).toEqual(report({ pendingRemovals: 1 }));
    expect(r2).toEqual(report({ pendingRemovals: 1 }));
    expect(r3).toEqual(report({ pendingRemovals: 1 }));
    expect(r4).toEqual(report({ pendingRemovals: 1 }));
  });

  it("a settled pair evicted by an ambiguity answer still blocks its Naka id (S4)", async () => {
    const w = world({
      naka: [1],
      sc: [1777],
      scTitle: { 1777: 1 },
      state: withMapping([p(1)], { snapshot: [p(1)] }),
    });
    const r1 = await runSync(w.ports);
    expect(r1).toEqual(report({ pendingRemovals: 1 }));
    const removal = w.state.pending.find((i) => i.kind === "removal");
    const ambiguity = w.state.pending.find((i) => i.kind === "ambiguity");
    if (!removal || !ambiguity) throw new Error("expected both questions");
    const kept = resolvePending(settlePair(w.state, p(1)), removal);
    w.state = resolvePending(
      upsertMapping(kept, { nakaId: 1, scId: 1777 }),
      ambiguity,
    );
    const r2 = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(r2).toEqual(report());
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
    const r = await runSync(w.ports);
    expect(r).toEqual(report());
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

  it("an empty state with empty lists writes nothing and saves emptyState() with one run counted", async () => {
    const w = world();
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(w.saved).toEqual([{ ...emptyState(), run: 1 }]);
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
    const r = await runSync(w.ports);
    expect(vi.mocked(resolveScIds).mock.calls[0]?.[0]).toEqual(
      range(1001, 1020),
    );
    expect(r).toEqual(
      report({ added: pairs(1, 10), deferred: pairs(11, 20), unresolved: 10 }),
    );
  });

  it("calls the resolver once per side even with nothing to resolve", async () => {
    const w = world({ naka: [1], sc: [1001], state: withMapping([p(1)]) });
    const r = await runSync(w.ports);
    expect(resolveNakaIds).toHaveBeenCalledTimes(1);
    expect(resolveScIds).toHaveBeenCalledTimes(1);
    expect(r).toEqual(report());
  });
});

describe("the resolution cap is not wasted (R3)", () => {
  const unlinked = (side: "naka" | "sc", id: number): UnlinkedItem => ({
    side,
    id,
    title: "x",
    reason: "no-match",
  });
  const ambiguity = (side: "naka" | "sc", id: number): PendingItem => ({
    kind: "ambiguity",
    side,
    id,
    candidateIds: [id + 5000],
  });
  const first = range(101, 120);
  const nakaArg = () => vi.mocked(resolveNakaIds).mock.calls[0]?.[0];

  it("skips 20 unlinked ids ahead of a new title (probe C)", async () => {
    const w = world({
      naka: [...first, 7],
      state: {
        ...emptyState(),
        unlinked: first.map((id) => unlinked("naka", id)),
      },
    });
    const r = await runSync(w.ports);
    expect(nakaArg()).toEqual([7]);
    expect(w.writes).toEqual(["addToSc:1007"]);
    expect(r).toEqual(report({ added: [p(7)] }));
    expect(w.saved[0]?.mapping).toEqual([p(7)]);
  });

  it("skips 20 ids with a pending ambiguity ahead of a new title", async () => {
    const w = world({
      naka: [...first, 7],
      state: {
        ...emptyState(),
        pending: first.map((id) => ambiguity("naka", id)),
      },
    });
    const r = await runSync(w.ports);
    expect(nakaArg()).toEqual([7]);
    expect(r).toEqual(report({ added: [p(7)] }));
  });

  // The mapped rule is reachable on both sides. On the SensCritique side the
  // Naka pass has just mapped most of the ids the first plan listed (this
  // test). On the Naka side a settled pair evicted from the mapping by an
  // ambiguity answer still shares its Naka id with the new pair (S4 below).
  it("filters the SC ids against the state after the Naka pass (probe J/K)", async () => {
    const w = world({ naka: range(1, 21), sc: range(1001, 1021) });
    const r1 = await runSync(w.ports);
    expect(w.describes.filter((d) => d.startsWith("sc:"))).toEqual(["sc:1021"]);
    expect(vi.mocked(resolveScIds).mock.calls[0]?.[0]).toEqual([1021]);
    expect(w.saved[0]?.mapping).toEqual(pairs(1, 21));
    expect(r1).toEqual(report());
    w.sc.delete(1021);
    const r2 = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(w.state.pending).toEqual([
      {
        kind: "removal",
        removeFrom: "naka",
        pair: p(21),
        asked: false,
        title: "Film 21",
      },
    ]);
    expect(r2).toEqual(report({ pendingRemovals: 1 }));
  });

  it("filters by side, not by bare id", async () => {
    const w = world({
      naka: [7, 8, 9],
      state: {
        ...withMapping([{ nakaId: 99, scId: 7 }]),
        unlinked: [unlinked("sc", 8)],
        pending: [ambiguity("sc", 9)],
      },
    });
    const r = await runSync(w.ports);
    expect(nakaArg()).toEqual([7, 8, 9]);
    expect(r).toEqual(report({ added: pairs(7, 9) }));
  });

  it("a SensCritique id mapped only through its Naka side is still resolved", async () => {
    const w = world({
      sc: [1008],
      state: withMapping([{ nakaId: 1008, scId: 99 }]),
    });
    const r = await runSync(w.ports);
    expect(vi.mocked(resolveScIds).mock.calls[0]?.[0]).toEqual([1008]);
    expect(r).toEqual(report({ added: [p(8)] }));
  });

  it("filters the SensCritique side too", async () => {
    const ids = range(1101, 1120);
    const w = world({
      sc: [...ids, 1007],
      state: { ...emptyState(), unlinked: ids.map((id) => unlinked("sc", id)) },
    });
    const r = await runSync(w.ports);
    expect(vi.mocked(resolveScIds).mock.calls[0]?.[0]).toEqual([1007]);
    expect(r).toEqual(report({ added: [p(7)] }));
  });

  it("an id that became unlinked during this run is not counted as waiting", async () => {
    const w = world({ naka: [1, 2], unknownNaka: [2] });
    const r = await runSync(w.ports);
    expect(w.saved[0]?.unlinked).toHaveLength(1);
    expect(r).toEqual(report({ added: [p(1)] }));
  });

  it("does not count filtered ids as unresolved", async () => {
    const w = world({
      naka: [...first, 7],
      state: {
        ...emptyState(),
        unlinked: first.map((id) => unlinked("naka", id)),
      },
      failSc: [1007],
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ failed: [p(7)] }));
  });
});

describe("failing writes (D2 step 5, R4)", () => {
  it("one failure does not stop the side; the other side continues", async () => {
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
      "addToSc:1004",
      "addToSc:1005",
      "addToNaka:11",
      "addToNaka:12",
    ]);
    expect(r).toEqual(
      report({
        added: [p(1), p(2), p(4), p(5), p(11), p(12)],
        failed: [p(3)],
      }),
    );
    expect(w.saved).toHaveLength(1);
    expect(w.saved[0]?.snapshot).toEqual([
      p(1),
      p(2),
      p(4),
      p(5),
      p(11),
      p(12),
    ]);
  });

  it("a poison pair first does not block the others", async () => {
    const w = world({
      naka: [1, 2, 3],
      failSc: [1001],
      state: withMapping(pairs(1, 3)),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToSc:1002", "addToSc:1003"]);
    expect(r).toEqual(report({ added: [p(2), p(3)], failed: [p(1)] }));
  });

  it("two consecutive failures stop the side: exactly 2 attempts", async () => {
    const w = world({
      naka: range(1, 5),
      failSc: range(1001, 1005),
      state: withMapping(pairs(1, 5)),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToSc:1002"]);
    expect(r).toEqual(report({ failed: [p(1), p(2)], deferred: pairs(3, 5) }));
    expect(w.saved[0]?.snapshot).toEqual([]);
  });

  it("each side counts its own failures", async () => {
    const w = world({
      naka: [1],
      sc: [1011, 1012],
      failSc: [1001],
      failNaka: [11],
      state: withMapping([p(1), p(11), p(12)]),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToNaka:11", "addToNaka:12"]);
    expect(r).toEqual(report({ added: [p(12)], failed: [p(1), p(11)] }));
  });

  it("a success resets the consecutive counter", async () => {
    const w = world({
      naka: range(1, 4),
      failSc: [1001, 1003],
      state: withMapping(pairs(1, 4)),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toHaveLength(4);
    expect(r).toEqual(report({ added: [p(2), p(4)], failed: [p(1), p(3)] }));
  });

  it("two consecutive non-Error failures on Naka stop Naka, not SensCritique", async () => {
    const w = world({
      naka: [1],
      sc: [1011, 1012, 1013],
      failNaka: [11, 12],
      state: withMapping([p(1), p(11), p(12), p(13)]),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToNaka:11", "addToNaka:12"]);
    expect(r).toEqual(
      report({ added: [p(1)], failed: [p(11), p(12)], deferred: [p(13)] }),
    );
  });

  it("a failed attempt counts against the cap: 1 SC failure then 10 Naka additions (probe B)", async () => {
    const w = world({
      naka: [1],
      sc: range(1011, 1020),
      failSc: [1001],
      state: withMapping([p(1), ...pairs(11, 20)]),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([
      "addToSc:1001",
      ...range(11, 19).map((n) => `addToNaka:${n}`),
    ]);
    expect(r).toEqual(
      report({ added: pairs(11, 19), failed: [p(1)], deferred: [p(20)] }),
    );
  });

  it("failures eat the cap too: 12 Naka-only titles, first one failing", async () => {
    const w = world({
      naka: range(1, 12),
      failSc: [1001],
      state: withMapping(pairs(1, 12)),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toHaveLength(10);
    expect(r).toEqual(
      report({ added: pairs(2, 10), failed: [p(1)], deferred: pairs(11, 12) }),
    );
  });
});

describe("snapshot from what the sites hold (D2 step 7, R1)", () => {
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
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ added: [p(1)] }));
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
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ failed: [p(1)] }));
    expect([w.nakaReads, w.scReads]).toEqual([1, 1]);
    expect(w.saved[0]?.snapshot).toEqual([p(9)]);
  });

  it("snapshots only pairs present in both lists", async () => {
    const w = world({
      naka: [1, 2],
      sc: [1001, 1003],
      state: withMapping([p(1), p(2), p(3)], { settled: [p(2), p(3)] }),
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report());
    expect(w.writes).toEqual([]);
    expect(w.saved[0]?.snapshot).toEqual([p(1)]);
  });

  it("a re-read never drops a title the owner removed mid-run (probe A)", async () => {
    const w = world({
      naka: [5],
      sc: [1005, 1001],
      afterNaka: (naka) => naka.delete(5),
      state: withMapping([p(5), p(1)], { snapshot: [p(5)] }),
    });
    const r1 = await runSync(w.ports);
    expect(w.saved[0]?.snapshot).toEqual([p(5), p(1)]);
    const r2 = await runSync(w.ports);
    expect(w.writes).toEqual(["addToNaka:1"]);
    expect(w.state.pending).toEqual([
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(5),
        asked: false,
        title: "Film 5",
      },
    ]);
    expect(r1).toEqual(report({ added: [p(1)] }));
    expect(r2).toEqual(report({ pendingRemovals: 1 }));
  });

  it("a pair the planner skips stays in the snapshot while it is on at least one side (U1)", async () => {
    const w = world({
      naka: [1],
      sc: [1002],
      state: withMapping([p(1), p(2)], {
        snapshot: [p(1), p(2)],
        settled: [p(1), p(2)],
      }),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(r).toEqual(report());
    expect(w.saved[0]?.snapshot).toEqual([p(1), p(2)]);
  });

  it("a snapshot pair that is on neither side leaves the snapshot", async () => {
    const w = world({ state: withMapping([p(1)], { snapshot: [p(1)] }) });
    const r = await runSync(w.ports);
    expect(r).toEqual(report());
    expect(w.saved[0]?.snapshot).toEqual([]);
  });

  it("a snapshot pair that is no longer mapped leaves the snapshot", async () => {
    const w = world({
      naka: [1],
      sc: [1001],
      state: withMapping([], { snapshot: [p(1)] }),
    });
    await runSync(w.ports);
    expect(w.saved[0]?.snapshot).toEqual([]);
  });

  it("a snapshot pair superseded by a remap leaves the snapshot, by either id", async () => {
    const q1 = { nakaId: 1, scId: 1777 };
    const q2 = { nakaId: 3, scId: 1002 };
    const w = world({
      naka: [1, 3],
      sc: [1001, 1002],
      scTitle: { 1001: 1 },
      state: withMapping([q1, q2], { snapshot: [p(1), p(2)] }),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1777"]);
    expect(r).toEqual(report({ added: [q1] }));
    expect(w.saved[0]?.snapshot).toEqual([q1, q2]);
  });

  it("a re-read keeps an id the owner added mid-run: a later removal becomes a question (probe M)", async () => {
    const w = world({
      sc: range(1001, 1011),
      afterNaka: (naka) => naka.add(11),
      state: withMapping(pairs(1, 11)),
    });
    const r1 = await runSync(w.ports);
    expect(r1).toEqual(report({ added: pairs(1, 10), deferred: [p(11)] }));
    expect(w.saved[0]?.snapshot).toEqual(pairs(1, 11));
    w.sc.delete(1011);
    w.writes.length = 0;
    const r2 = await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(w.state.pending).toEqual([
      {
        kind: "removal",
        removeFrom: "naka",
        pair: p(11),
        asked: false,
        title: "Film 11",
      },
    ]);
    expect(r2).toEqual(report({ pendingRemovals: 1 }));
  });

  it("a write without effect stays out of the snapshot even after a re-read", async () => {
    const w = world({
      sc: [1001, 1002],
      noEffectNaka: true,
      state: withMapping([p(1), p(2)]),
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ added: [p(1), p(2)] }));
    expect(w.saved[0]?.snapshot).toEqual([]);
  });
});

describe("a failed pair goes last until it succeeds (S3)", () => {
  const retry = (...ps: Pair[]) => ({ retryLast: ps });

  it("does not starve the side over runs (probe I)", async () => {
    const w = world({
      naka: range(1, 5),
      failSc: [1001, 1002],
      state: withMapping(pairs(1, 5)),
    });
    const r1 = await runSync(w.ports);
    expect(r1).toEqual(report({ failed: [p(1), p(2)], deferred: pairs(3, 5) }));
    expect(w.saved[0]?.retryLast).toEqual([p(1), p(2)]);
    w.writes.length = 0;
    const r2 = await runSync(w.ports);
    expect(w.writes).toEqual([
      "addToSc:1003",
      "addToSc:1004",
      "addToSc:1005",
      "addToSc:1001",
      "addToSc:1002",
    ]);
    expect(r2).toEqual(report({ added: pairs(3, 5), failed: [p(1), p(2)] }));
    expect(w.saved[1]?.retryLast).toEqual([p(1), p(2)]);
    w.writes.length = 0;
    const r3 = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1001", "addToSc:1002"]);
    expect(r3).toEqual(report({ failed: [p(1), p(2)] }));
  });

  it("failing pairs rotate to the back so they cannot starve the demoted group (probe S3)", async () => {
    const failSc = [1001, 1002];
    const w = world({
      naka: range(1, 5),
      failSc,
      state: withMapping(pairs(1, 5)),
    });
    const order = () => w.state.retryLast.map((x) => x.nakaId);
    const log: { writes: string[]; retry: number[]; deferred: Pair[] }[] = [];
    for (let run = 1; run <= 4; run++) {
      failSc.length = 0;
      failSc.push(1001, 1002, ...(run === 2 ? [1003, 1004] : []));
      w.writes.length = 0;
      const r = await runSync(w.ports);
      log.push({ writes: [...w.writes], retry: order(), deferred: r.deferred });
    }
    expect(log.map((l) => l.writes)).toEqual([
      ["addToSc:1001", "addToSc:1002"],
      ["addToSc:1003", "addToSc:1004"],
      ["addToSc:1005", "addToSc:1001", "addToSc:1002"],
      ["addToSc:1003", "addToSc:1004", "addToSc:1001", "addToSc:1002"],
    ]);
    expect(log.map((l) => l.retry)).toEqual([
      [1, 2],
      [1, 2, 3, 4],
      [3, 4, 1, 2],
      [1, 2],
    ]);
    expect(log[1]?.deferred).toEqual([p(5), p(1), p(2)]);
    expect(log[2]?.deferred).toEqual([p(3), p(4)]);
  });

  it("a demoted pair deferred by the cap stays in retryLast", async () => {
    const w = world({
      naka: range(1, 11),
      state: withMapping(pairs(1, 11), retry(p(1))),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(range(2, 11).map((n) => `addToSc:${n + 1000}`));
    expect(r).toEqual(report({ added: pairs(2, 11), deferred: [p(1)] }));
    expect(w.saved[0]?.retryLast).toEqual([p(1)]);
  });

  it("a demoted pair that succeeds leaves retryLast", async () => {
    const w = world({
      naka: [1, 2],
      state: withMapping(pairs(1, 2), retry(p(1))),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1002", "addToSc:1001"]);
    expect(r).toEqual(report({ added: [p(2), p(1)] }));
    expect(w.saved[0]?.retryLast).toEqual([]);
  });

  it("a pair that left the mapping leaves retryLast", async () => {
    const w = world({
      naka: [1],
      state: withMapping([p(1)], retry(p(9), p(1))),
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ added: [p(1)] }));
    expect(w.saved[0]?.retryLast).toEqual([]);
    const v = world({
      naka: [1],
      failSc: [1001],
      state: withMapping([p(1)], retry(p(9))),
    });
    const rv = await runSync(v.ports);
    expect(rv).toEqual(report({ failed: [p(1)] }));
    expect(v.saved[0]?.retryLast).toEqual([p(1)]);
  });

  it("the partition is per side: SC side first, then Naka", async () => {
    const w = world({
      naka: [1, 2],
      sc: [1011],
      state: withMapping([p(1), p(2), p(11)], retry(p(1))),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1002", "addToSc:1001", "addToNaka:11"]);
    expect(r).toEqual(report({ added: [p(2), p(1), p(11)] }));
  });

  it("deduplicates retryLast when a demoted pair fails again", async () => {
    const w = world({
      naka: [1],
      failSc: [1001],
      state: withMapping([p(1)], retry(p(1))),
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ failed: [p(1)] }));
    expect(w.saved[0]?.retryLast).toEqual([p(1)]);
  });

  it("a planned pair listed twice in retryLast is written once (probe DUP)", async () => {
    const w = world({
      naka: [1],
      state: withMapping([p(1)], retry(p(1), p(1))),
    });
    const r = await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:1001"]);
    expect(r).toEqual(report({ added: [p(1)] }));
    expect(w.saved[0]?.retryLast).toEqual([]);
  });

  it("deduplicates a retryLast that arrives with a duplicate", async () => {
    const w = world({ state: withMapping([p(1)], retry(p(1), p(1))) });
    const r = await runSync(w.ports);
    expect(r).toEqual(report());
    expect(w.saved[0]?.retryLast).toEqual([p(1)]);
  });

  it("does not mutate a deep-frozen retryLast", async () => {
    const w = world({
      naka: [1, 2],
      failSc: [1001],
      state: deepFreeze(withMapping(pairs(1, 2), retry(p(1)))),
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ added: [p(2)], failed: [p(1)] }));
  });
});

describe("purity (D4)", () => {
  it("does not mutate a deep-frozen loaded state", async () => {
    const w = world({
      naka: [1, 2],
      state: deepFreeze(withMapping([p(1), p(2)], { snapshot: [p(2)] })),
    });
    const r = await runSync(w.ports);
    expect(r).toEqual(report({ added: [p(1)], pendingRemovals: 1 }));
  });
});
