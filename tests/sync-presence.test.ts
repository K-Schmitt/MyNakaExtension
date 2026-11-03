import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import {
  emptyState,
  type PendingItem,
  type SyncState,
  settlePair,
  unsettlePair,
  upsertMapping,
} from "../src/core/state";
import {
  runSync,
  type SyncPorts,
  type SyncReport,
} from "../src/core/sync-runner";
import type { Candidate, Titled } from "../src/core/title-match";

// The REAL runner with resolution: a pair whose two ids were in their lists at the end of the same
// completed run (during the current presence period of each) is known as if it had been snapshotted,
// even when it maps only later (resolution cap, failed search, open question). A one-sided state after
// that is the owner removing a side: a question, never an addition.

const film = (n: number): Titled => ({
  title: `Film ${n}`,
  year: 2000 + n,
  type: "film",
});
const FILM5_NO_YEAR: Titled = { title: "Film 5", type: "film" };
const PAIR5: Pair = { nakaId: 5, scId: 1005 };

type Opts = {
  naka: number[];
  sc: number[];
  // What describeNaka returns; the Naka search reads `nakaCatalogue` (default: the same titles).
  nakaTitles: Record<number, Titled>;
  nakaCatalogue?: Record<number, Titled>;
  scTitles: Record<number, Titled>;
  state?: SyncState;
};

function candidates(titles: Record<number, Titled>, q: string): Candidate[] {
  return Object.entries(titles)
    .filter(([, titled]) => titled.title === q)
    .map(([id, titled]) => ({ id: Number(id), ...titled }));
}

function world(o: Opts) {
  const w = {
    naka: new Set(o.naka),
    sc: new Set(o.sc),
    state: o.state ?? emptyState(),
    writes: [] as string[],
    // Every search rejects (a rate limit), or only the next `failNext` searches.
    offline: false,
    failNext: 0,
  };
  const search =
    (titles: Record<number, Titled>) =>
    async (q: string): Promise<Candidate[]> => {
      if (w.offline) throw new Error("429");
      if (w.failNext > 0) {
        w.failNext -= 1;
        throw new Error("429");
      }
      return candidates(titles, q);
    };
  const ports: SyncPorts = {
    load: async () => w.state,
    save: async (state) => {
      w.state = state;
    },
    nakaIds: async () => [...w.naka],
    scWishlistIds: async () => [...w.sc],
    addToSc: async (id) => {
      w.writes.push(`addToSc:${id}`);
      w.sc.add(id);
    },
    addToNaka: async (id) => {
      w.writes.push(`addToNaka:${id}`);
      w.naka.add(id);
    },
    describeNaka: async (id) => o.nakaTitles[id],
    describeSc: async (id) => o.scTitles[id],
    searchNaka: search(o.nakaCatalogue ?? o.nakaTitles),
    searchSc: search(o.scTitles),
  };
  return { w, ports };
}

const report = (r: Partial<SyncReport> = {}): SyncReport => ({
  added: [],
  deferred: [],
  failed: [],
  pendingRemovals: 0,
  unresolved: 0,
  ...r,
});

const removal = (removeFrom: "naka" | "sc", pair: Pair): PendingItem => ({
  kind: "removal",
  removeFrom,
  pair,
  asked: false,
});

// Plan 3's answer (contract): ONE save that upserts the chosen pair and resolves every open ambiguity
// about the same Naka id or the same SensCritique id.
function answer(state: SyncState, pair: Pair): SyncState {
  const about = (item: PendingItem): boolean =>
    item.kind === "ambiguity" &&
    ((item.side === "naka" && item.id === pair.nakaId) ||
      (item.side === "sc" && item.id === pair.scId));
  const mapped = upsertMapping(state, pair);
  return { ...mapped, pending: mapped.pending.filter((item) => !about(item)) };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe("a pair seen together before it was mapped", () => {
  it("P3b: first sync, the cap and a failed search delay the mapping; the owner's removal becomes a question", async () => {
    const others = Array.from({ length: 25 }, (_, i) => 3000 + i);
    const scTitles: Record<number, Titled> = { 1005: film(5) };
    for (const id of others) {
      scTitles[id] = { title: `Other ${id}`, year: 1999, type: "film" };
    }
    const { w, ports } = world({
      naka: [5],
      sc: [...others, 1005],
      nakaTitles: { 5: film(5) },
      scTitles,
    });
    w.failNext = 1;
    const r1 = await runSync(ports);
    expect(w.state.mapping).toEqual([]);
    expect(w.writes).toEqual([]);
    expect(r1).toEqual(report({ unresolved: 7 }));
    expect(w.state.run).toBe(1);
    expect(w.state.presence.naka).toEqual([{ id: 5, from: 1, to: 1 }]);
    expect(w.state.presence.sc).toContainEqual({ id: 1005, from: 1, to: 1 });
    w.sc.delete(1005);
    const r2 = await runSync(ports);
    expect(w.state.mapping).toEqual([PAIR5]);
    expect(w.writes).toEqual([]);
    expect(w.state.pending).toEqual([removal("naka", PAIR5)]);
    expect(w.state.snapshot).toEqual([PAIR5]);
    expect(r2).toEqual(report({ pendingRemovals: 1 }));
    const r3 = await runSync(ports);
    expect(w.writes).toEqual([]);
    expect(r3).toEqual(report({ pendingRemovals: 1 }));
  });

  it.each([
    ["a run happens before the answer", true],
    ["the answer comes before any run (probe P3)", false],
  ])(
    "P3: an open question delays the mapping, the owner removes 1005, %s: a question, no write",
    async (_name, runBetween) => {
      const { w, ports } = world({
        naka: [5],
        sc: [1005],
        nakaTitles: { 5: FILM5_NO_YEAR },
        nakaCatalogue: { 5: film(5) },
        scTitles: { 1005: film(5) },
      });
      expect(await runSync(ports)).toEqual(report());
      expect(w.state.pending).toEqual([
        { kind: "ambiguity", side: "naka", id: 5, candidateIds: [1005] },
        { kind: "ambiguity", side: "sc", id: 1005, candidateIds: [5] },
      ]);
      w.sc.delete(1005);
      if (runBetween) {
        expect(await runSync(ports)).toEqual(report());
        expect(w.state.presence.sc).toEqual([{ id: 1005, from: 1, to: 1 }]);
      }
      w.state = answer(w.state, PAIR5);
      const r = await runSync(ports);
      expect(w.writes).toEqual([]);
      expect(w.state.pending).toEqual([removal("naka", PAIR5)]);
      expect(r).toEqual(report({ pendingRemovals: 1 }));
    },
  );

  it("a pair seen together, mapped and settled, then unsettled, is asked about, not re-added", async () => {
    const { w, ports } = world({
      naka: [5],
      sc: [1005],
      nakaTitles: { 5: film(5) },
      scTitles: { 1005: film(5) },
    });
    w.offline = true;
    expect(await runSync(ports)).toEqual(report({ unresolved: 2 }));
    // A finish maps and settles the pair and unwishes the film.
    w.state = settlePair(upsertMapping(w.state, PAIR5), PAIR5);
    w.sc.delete(1005);
    expect(await runSync(ports)).toEqual(report());
    expect(w.state.snapshot).toEqual([PAIR5]);
    w.state = unsettlePair(w.state, PAIR5);
    const r = await runSync(ports);
    expect(w.writes).toEqual([]);
    expect(w.state.pending).toEqual([removal("naka", PAIR5)]);
    expect(r).toEqual(report({ pendingRemovals: 1 }));
  });
});

describe("the owner's latest action wins: additions", () => {
  const titles = { nakaTitles: { 5: film(5) }, scTitles: { 1005: film(5) } };

  it("a first sync only adds, even when the mapping comes a run late", async () => {
    const { w, ports } = world({ naka: [5], sc: [], ...titles });
    w.offline = true;
    expect(await runSync(ports)).toEqual(report({ unresolved: 1 }));
    w.offline = false;
    const r = await runSync(ports);
    expect(w.writes).toEqual(["addToSc:1005"]);
    expect(r).toEqual(report({ added: [PAIR5] }));
  });

  it("latest intent: 1005 left SensCritique at run 3, film 5 arrived on Naka at run 5 and maps at run 6", async () => {
    const { w, ports } = world({ naka: [], sc: [1005], ...titles });
    w.offline = true;
    const waiting: number[] = [];
    for (let run = 1; run <= 5; run++) {
      if (run === 3) w.sc.delete(1005);
      if (run === 5) w.naka.add(5);
      const r = await runSync(ports);
      expect(r).toEqual(report({ unresolved: r.unresolved }));
      waiting.push(r.unresolved);
    }
    expect(waiting).toEqual([1, 1, 0, 0, 1]);
    expect(w.state.presence).toEqual({
      naka: [{ id: 5, from: 5, to: 5 }],
      sc: [{ id: 1005, from: 1, to: 2 }],
    });
    w.offline = false;
    const r = await runSync(ports);
    expect(w.writes).toEqual(["addToSc:1005"]);
    expect(r).toEqual(report({ added: [PAIR5] }));
  });

  it("the owner moves the title between two runs: 1005 last seen at run 2, film 5 first seen at run 3", async () => {
    const { w, ports } = world({ naka: [], sc: [1005], ...titles });
    w.offline = true;
    expect(await runSync(ports)).toEqual(report({ unresolved: 1 }));
    expect(await runSync(ports)).toEqual(report({ unresolved: 1 }));
    w.sc.delete(1005);
    w.naka.add(5);
    expect(await runSync(ports)).toEqual(report({ unresolved: 1 }));
    expect(w.state.presence).toEqual({
      naka: [{ id: 5, from: 3, to: 3 }],
      sc: [{ id: 1005, from: 1, to: 2 }],
    });
    w.offline = false;
    const r = await runSync(ports);
    expect(w.writes).toEqual(["addToSc:1005"]);
    expect(r).toEqual(report({ added: [PAIR5] }));
  });

  it("re-appearance: film 5 present in runs 1-3 and from run 6, 1005 in runs 2-3 only, mapped at run 8", async () => {
    const { w, ports } = world({ naka: [5], sc: [], ...titles });
    w.offline = true;
    const waiting: number[] = [];
    for (let run = 1; run <= 7; run++) {
      if (run === 2) w.sc.add(1005);
      if (run === 4) {
        w.naka.delete(5);
        w.sc.delete(1005);
      }
      if (run === 6) w.naka.add(5);
      const r = await runSync(ports);
      expect(r).toEqual(report({ unresolved: r.unresolved }));
      waiting.push(r.unresolved);
    }
    expect(waiting).toEqual([1, 2, 2, 0, 0, 1, 1]);
    expect(w.state.presence).toEqual({
      naka: [{ id: 5, from: 6, to: 7 }],
      sc: [{ id: 1005, from: 2, to: 3 }],
    });
    w.offline = false;
    const r = await runSync(ports);
    expect(w.writes).toEqual(["addToSc:1005"]);
    expect(r).toEqual(report({ added: [PAIR5] }));
  });

  it("a synced title removed from both lists and re-added on Naka is added back to SensCritique", async () => {
    const { w, ports } = world({
      naka: [5],
      sc: [1005],
      ...titles,
      state: { ...emptyState(), mapping: [PAIR5] },
    });
    expect(await runSync(ports)).toEqual(report());
    expect(w.state.snapshot).toEqual([PAIR5]);
    w.naka.delete(5);
    w.sc.delete(1005);
    expect(await runSync(ports)).toEqual(report());
    expect(w.state.presence).toEqual({ naka: [], sc: [] });
    w.naka.add(5);
    const r = await runSync(ports);
    expect(w.writes).toEqual(["addToSc:1005"]);
    expect(r).toEqual(report({ added: [PAIR5] }));
  });
});

describe("presence bookkeeping", () => {
  it("an absent mapped id leaves presence; an absent unmapped id stays", async () => {
    const { w, ports } = world({
      naka: [1, 2, 7],
      sc: [1001, 1002, 1009],
      nakaTitles: { 7: film(7) },
      scTitles: { 1009: film(9) },
      state: {
        ...emptyState(),
        mapping: [
          { nakaId: 1, scId: 1001 },
          { nakaId: 2, scId: 1002 },
        ],
      },
    });
    w.offline = true;
    expect(await runSync(ports)).toEqual(report({ unresolved: 2 }));
    expect(w.state.presence).toEqual({
      naka: [
        { id: 1, from: 1, to: 1 },
        { id: 2, from: 1, to: 1 },
        { id: 7, from: 1, to: 1 },
      ],
      sc: [
        { id: 1001, from: 1, to: 1 },
        { id: 1002, from: 1, to: 1 },
        { id: 1009, from: 1, to: 1 },
      ],
    });
    w.naka.delete(1);
    w.naka.delete(7);
    w.sc.delete(1002);
    w.sc.delete(1009);
    expect(await runSync(ports)).toEqual(report({ pendingRemovals: 2 }));
    expect(w.state.run).toBe(2);
    expect(w.state.presence).toEqual({
      naka: [
        { id: 2, from: 1, to: 2 },
        { id: 7, from: 1, to: 1 },
      ],
      sc: [
        { id: 1001, from: 1, to: 2 },
        { id: 1009, from: 1, to: 1 },
      ],
    });
  });

  it("reads the final lists: a title the owner added mid-run, seen by the re-read, was seen together", async () => {
    const pair1 = { nakaId: 1, scId: 1001 };
    const { w, ports } = world({
      naka: [],
      sc: [1001, 1005],
      nakaTitles: { 5: film(5) },
      scTitles: { 1005: film(5) },
      state: { ...emptyState(), mapping: [pair1] },
    });
    w.offline = true;
    const addToNaka = ports.addToNaka;
    ports.addToNaka = async (id) => {
      await addToNaka(id);
      w.naka.add(5);
    };
    expect(await runSync(ports)).toEqual(
      report({ added: [pair1], unresolved: 1 }),
    );
    expect(w.state.presence.naka).toEqual([
      { id: 1, from: 1, to: 1 },
      { id: 5, from: 1, to: 1 },
    ]);
    w.sc.delete(1005);
    w.offline = false;
    const r = await runSync(ports);
    expect(w.writes).toEqual(["addToNaka:1"]);
    expect(w.state.pending).toEqual([removal("naka", PAIR5)]);
    expect(r).toEqual(report({ pendingRemovals: 1 }));
  });

  it("counts completed runs only: a run that fails to read a list changes nothing", async () => {
    const { w, ports } = world({
      naka: [1],
      sc: [],
      nakaTitles: {},
      scTitles: {},
    });
    expect(await runSync(ports)).toEqual(report());
    await expect(
      runSync({
        ...ports,
        scWishlistIds: async () => {
          throw new Error("sc read");
        },
      }),
    ).rejects.toThrow("sc read");
    expect(w.state.run).toBe(1);
    expect(await runSync(ports)).toEqual(report());
    expect(w.state.run).toBe(2);
    expect(w.state.presence.naka).toEqual([{ id: 1, from: 1, to: 2 }]);
  });

  it("does not mutate a deep-frozen loaded state", async () => {
    const loaded: SyncState = {
      ...emptyState(),
      mapping: [PAIR5],
      run: 3,
      presence: {
        naka: [{ id: 5, from: 1, to: 3 }],
        sc: [
          { id: 1005, from: 2, to: 2 },
          { id: 1009, from: 1, to: 1 },
        ],
      },
    };
    const copy = structuredClone(loaded);
    const { w, ports } = world({
      naka: [5],
      sc: [1009],
      nakaTitles: {},
      scTitles: {},
      state: deepFreeze(loaded),
    });
    w.offline = true;
    const r = await runSync(ports);
    expect(loaded).toEqual(copy);
    expect(w.writes).toEqual([]);
    expect(w.state.pending).toEqual([removal("naka", PAIR5)]);
    expect(r).toEqual(report({ pendingRemovals: 1 }));
    expect(w.state.presence).toEqual({
      naka: [{ id: 5, from: 1, to: 4 }],
      sc: [{ id: 1009, from: 4, to: 4 }],
    });
  });
});
