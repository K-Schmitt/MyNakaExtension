import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import { MAX_TITLED_REMOVALS } from "../src/core/removal-titles";
import { emptyState, type SyncState } from "../src/core/state";
import { runSync, type SyncPorts } from "../src/core/sync-runner";

const p = (n: number): Pair => ({ nakaId: n, scId: n + 1000 });

type Opts = {
  naka?: number[];
  sc?: number[];
  state: SyncState;
  /** Called after each Naka write. */
  afterNaka?: (naka: Set<number>) => void;
  nakaThrows?: boolean;
};

function world(o: Opts) {
  const w = {
    naka: new Set(o.naka ?? []),
    sc: new Set(o.sc ?? []),
    state: o.state,
    writes: [] as string[],
    describes: [] as string[],
    saved: [] as SyncState[],
    ports: undefined as unknown as SyncPorts,
  };
  w.ports = {
    load: async () => w.state,
    save: async (s) => {
      w.saved.push(s);
      w.state = s;
    },
    nakaIds: async () => [...w.naka],
    scWishlistIds: async () => [...w.sc],
    addToSc: async (id) => {
      w.writes.push(`addToSc:${id}`);
      w.sc.add(id);
      return "added";
    },
    addToNaka: async (id) => {
      w.writes.push(`addToNaka:${id}`);
      w.naka.add(id);
      o.afterNaka?.(w.naka);
    },
    describeNaka: async (id) => {
      w.describes.push(`naka:${id}`);
      if (o.nakaThrows) throw new Error("tab read");
      return { title: `N${id}`, year: 2000, type: "film" };
    },
    describeSc: async (id) => {
      w.describes.push(`sc:${id}`);
      return { title: `S${id}`, year: 2000, type: "film" };
    },
    searchNaka: async () => [],
    searchSc: async () => [],
  };
  return w;
}

const stored = (
  pairs: Pair[],
  removals: { removeFrom: "naka" | "sc"; pair: Pair }[],
  extra: Partial<SyncState> = {},
): SyncState => ({
  ...emptyState(),
  mapping: pairs,
  snapshot: pairs,
  pending: removals.map((r) => ({ kind: "removal", ...r, asked: false })),
  ...extra,
});

const removals = (s: SyncState) =>
  s.pending.filter((i) => i.kind === "removal");

describe("a removal that lost its object is closed by the sync", () => {
  it("closes the removal of a pair now absent from both lists, with no write", async () => {
    const w = world({
      state: stored([p(1)], [{ removeFrom: "sc", pair: p(1) }]),
    });
    await runSync(w.ports);
    expect(removals(w.state)).toEqual([]);
    expect(w.writes).toEqual([]);
    expect(w.state.snapshot).toEqual([]);
  });

  it("closes the removal of a pair now present in both lists, and snapshots it", async () => {
    const w = world({
      naka: [1],
      sc: [1001],
      state: stored([p(1)], [{ removeFrom: "sc", pair: p(1) }]),
    });
    await runSync(w.ports);
    expect(removals(w.state)).toEqual([]);
    expect(w.state.snapshot).toEqual([p(1)]);
  });

  it("keeps the removal of a pair the mapping superseded, and writes nothing to Naka", async () => {
    const old = { nakaId: 10, scId: 1010 };
    const w = world({
      sc: [2010],
      state: stored(
        [{ nakaId: 10, scId: 2010 }],
        [{ removeFrom: "sc", pair: old }],
        { snapshot: [old] },
      ),
    });
    await runSync(w.ports);
    await runSync(w.ports);
    expect(w.writes).toEqual([]);
    expect(removals(w.state)).toHaveLength(1);
  });

  it("keeps the removal of a pair that is no longer mapped", async () => {
    const w = world({ state: stored([], [{ removeFrom: "sc", pair: p(1) }]) });
    await runSync(w.ports);
    expect(removals(w.state)).toHaveLength(1);
  });

  it("keeps a removal created by this run (one side only)", async () => {
    const w = world({ naka: [1], state: stored([p(1)], []) });
    await runSync(w.ports);
    expect(removals(w.state)).toHaveLength(1);
  });

  it("keeps a stored removal whose pair is still on one side", async () => {
    const w = world({
      sc: [1001],
      state: stored([p(1)], [{ removeFrom: "naka", pair: p(1) }]),
    });
    await runSync(w.ports);
    expect(removals(w.state)).toHaveLength(1);
  });

  it("judges the final lists, not the lists read at the start", async () => {
    const w = world({
      sc: [1001, 1002],
      state: stored([p(1), p(2)], [{ removeFrom: "sc", pair: p(1) }], {
        mapping: [p(1), p(2)],
        snapshot: [p(1)],
      }),
      afterNaka: (naka) => naka.add(1),
    });
    await runSync(w.ports);
    expect(w.writes).toContain("addToNaka:2");
    expect(removals(w.state)).toEqual([]);
  });

  it("closes the recorded shape {21391, 112240873} gone from both lists, then a re-add is a new addition", async () => {
    const pair = { nakaId: 21391, scId: 112240873 };
    const w = world({ state: stored([pair], [{ removeFrom: "naka", pair }]) });
    await runSync(w.ports);
    expect(removals(w.state)).toEqual([]);
    w.naka.add(21391);
    await runSync(w.ports);
    expect(w.writes).toEqual(["addToSc:112240873"]);
  });
});

describe("a new removal gets a title", () => {
  it("takes the wishlist title for removeFrom sc", async () => {
    const w = world({ sc: [1001], state: stored([p(1)], []) });
    await runSync(w.ports);
    expect(removals(w.state)).toEqual([
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(1),
        asked: false,
        title: "S1001",
      },
    ]);
  });

  it("takes the Naka title for removeFrom naka", async () => {
    const w = world({ naka: [1], state: stored([p(1)], []) });
    await runSync(w.ports);
    expect(removals(w.state)[0]).toMatchObject({ title: "N1" });
  });

  it("leaves a removal untitled when the Naka read throws, and completes", async () => {
    const w = world({ naka: [1], nakaThrows: true, state: stored([p(1)], []) });
    await runSync(w.ports);
    expect(removals(w.state)).toEqual([
      { kind: "removal", removeFrom: "naka", pair: p(1), asked: false },
    ]);
  });

  it("does not read again the title of a removal already stored", async () => {
    const w = world({
      naka: [1],
      state: stored([p(1)], [{ removeFrom: "naka", pair: p(1) }]),
    });
    await runSync(w.ports);
    expect(w.describes).toEqual([]);
  });

  it("titles every removeFrom sc removal: the wishlist read is free", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    const w = world({
      sc: ids.map((i) => i + 1000),
      state: stored(ids.map(p), []),
    });
    await runSync(w.ports);
    const titled = removals(w.state).filter((r) => r.title !== undefined);
    expect(titled).toHaveLength(12);
  });

  it("reads at most MAX_TITLED_REMOVALS Naka titles per pass", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    const w = world({ naka: ids, state: stored(ids.map(p), []) });
    await runSync(w.ports);
    expect(MAX_TITLED_REMOVALS).toBe(10);
    expect(w.describes.filter((d) => d.startsWith("naka:"))).toHaveLength(10);
    expect(removals(w.state)).toHaveLength(12);
  });
});
