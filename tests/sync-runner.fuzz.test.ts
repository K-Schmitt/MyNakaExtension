import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import {
  emptyState,
  markAsked,
  type PendingItem,
  resolvePending,
  type SyncState,
  settlePair,
  upsertMapping,
} from "../src/core/state";
import { runSync } from "../src/core/sync-runner";

// Model-based fuzz of the real runSync. The owner edits both lists (also in
// the middle of a run), writes fail or have no effect, re-reads reject and the
// Plan-3 answers (keep, remove, remove without effect, asked) arrive between
// runs. Oracle: the runner never writes a title back to a side after the
// owner removed it there, once a completed run had seen the pair in both lists.

// 14 titles so the write cap of 10 binds. Remap answers (upsertMapping, as
// Plan 3 will do) move a title to another SensCritique id while its removal is
// still pending; answering that removal afterwards lifts the protection only
// when it was set on an id of the evicted pair (probe E, a Plan 3 contract:
// the ambiguity answer settles the new pair).
const TITLES = 14;
const STEPS = 60;
const SEEDS = 1200;

type Side = "naka" | "sc";

const p = (n: number): Pair => ({ nakaId: n, scId: n + 1000 });

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const titleOf = (side: Side, id: number): number =>
  side === "naka" ? id : id % 1000;

async function simulate(seed: number): Promise<string[]> {
  const r = rng(seed);
  const lists = { naka: new Set<number>(), sc: new Set<number>() };
  for (let n = 1; n <= TITLES; n++) {
    if (r() < 0.5) lists.naka.add(n);
    if (r() < 0.5) lists.sc.add(n + 1000);
  }
  let state: SyncState = {
    ...emptyState(),
    mapping: Array.from({ length: TITLES }, (_, i) => p(i + 1)),
  };
  const seenBoth = new Set<number>();
  const protectedFrom = new Map<number, Side>();
  const protectedId = new Map<number, number>();
  const log: string[] = [];
  const violations: string[] = [];

  const scOf = (n: number): number =>
    state.mapping.find((m) => m.nakaId === n)?.scId ?? n + 1000;
  const idOf = (n: number, side: Side): number =>
    side === "naka" ? n : scOf(n);
  const remove = (
    n: number,
    side: Side,
    who: string,
    id = idOf(n, side),
  ): void => {
    const both = lists.naka.has(n) && lists.sc.has(scOf(n));
    if (!lists[side].delete(id)) return;
    if (both && seenBoth.has(n)) {
      protectedFrom.set(n, side);
      protectedId.set(n, id);
    }
    seenBoth.delete(n);
    log.push(`${who} remove ${side} ${n}`);
  };
  const add = (n: number, side: Side, who: string): void => {
    if (lists[side].has(idOf(n, side))) return;
    lists[side].add(idOf(n, side));
    protectedFrom.delete(n);
    log.push(`${who} add ${side} ${n}`);
  };
  const evicted = (pair: Pair): boolean =>
    !state.mapping.some(
      (m) => m.nakaId === pair.nakaId && m.scId === pair.scId,
    );
  const answer = (item: PendingItem & { kind: "removal" }): void => {
    const b = r();
    const n = item.pair.nakaId;
    if (b < 0.25) {
      state = resolvePending(settlePair(state, item.pair), item);
      log.push(`keep ${n}`);
    } else if (b < 0.5) {
      const id = item.removeFrom === "naka" ? item.pair.nakaId : item.pair.scId;
      remove(n, item.removeFrom, "plan3", id);
      state = resolvePending(state, item);
      log.push(`answer remove ${item.removeFrom} ${n}`);
    } else if (b < 0.75) {
      state = resolvePending(state, item);
      log.push(`answer remove (no effect) ${n}`);
    } else {
      state = markAsked(state, item.pair);
      log.push(`asked ${n}`);
      return;
    }
    // Probe E only: the answered pair was evicted and the protection was set on
    // an id of that very pair. Any other protection stays.
    const side = protectedFrom.get(n);
    const evictedId =
      side === "naka" ? item.pair.nakaId : side === "sc" ? item.pair.scId : -1;
    if (evicted(item.pair) && protectedId.get(n) === evictedId) {
      protectedFrom.delete(n);
    }
  };
  const remap = (item: PendingItem & { kind: "removal" }): void => {
    if (evicted(item.pair)) return;
    const n = item.pair.nakaId;
    state = upsertMapping(state, { nakaId: n, scId: n + 2000 });
    if (r() < 0.5) lists.sc.add(n + 2000);
    log.push(`remap ${n}`);
  };

  const oneRun = async (): Promise<void> => {
    const start = { naka: new Set(lists.naka), sc: new Set(lists.sc) };
    let nakaReads = 0;
    let scReads = 0;
    let firstNakaRead: number[] = [];
    let lastNaka: number[] = [];
    let lastSc: number[] = [];
    const write = async (side: Side, id: number): Promise<void> => {
      const n = titleOf(side, id);
      if (protectedFrom.get(n) === side) {
        violations.push(
          `seed ${seed}: write ${side} ${n} | ${log.slice(-10).join("; ")}`,
        );
      }
      log.push(`runner add ${side} ${n}`);
      if (r() < 0.2) throw new Error("fail");
      if (r() > 0.1) lists[side].add(id);
      if (r() < 0.3) {
        const k = 1 + Math.floor(r() * TITLES);
        const sd: Side = r() < 0.5 ? "naka" : "sc";
        if (start[sd].has(idOf(k, sd))) remove(k, sd, "owner mid-run");
        else add(k, sd, "owner mid-run");
      }
    };
    await runSync({
      load: async () => state,
      save: async (s) => {
        state = s;
      },
      nakaIds: async () => {
        nakaReads += 1;
        if (nakaReads > 1 && r() < 0.2) throw new Error("re-read");
        const list = [...lists.naka];
        if (nakaReads === 1) firstNakaRead = list;
        lastNaka = list;
        return list;
      },
      scWishlistIds: async () => {
        scReads += 1;
        if (scReads > 1 && r() < 0.2) throw new Error("re-read");
        const list = [...lists.sc];
        lastSc = list;
        if (scReads === 1) {
          for (const k of firstNakaRead) {
            if (list.includes(scOf(k))) seenBoth.add(k);
          }
        }
        return list;
      },
      addToSc: (id) => write("sc", id),
      addToNaka: (id) => write("naka", id),
      describeNaka: async () => undefined,
      describeSc: async () => undefined,
      searchSc: async () => [],
      searchNaka: async () => [],
    });
    // Invariant: a pending removal keeps its pair in the saved snapshot, so
    // that the question never turns into an addition (the oracle alone cannot
    // see this once the snapshot carries the loaded pairs).
    for (const item of state.pending) {
      if (item.kind !== "removal") continue;
      const kept = state.snapshot.some(
        (s) => s.nakaId === item.pair.nakaId && s.scId === item.pair.scId,
      );
      if (!kept) {
        violations.push(
          `seed ${seed}: pending removal ${item.pair.nakaId} left the snapshot`,
        );
      }
    }
    // The completed run also saw, through its re-reads, titles the owner added mid-run.
    for (let k = 1; k <= TITLES; k++) {
      if (lastNaka.includes(k) && lastSc.includes(scOf(k))) seenBoth.add(k);
    }
  };

  for (let step = 0; step < STEPS; step++) {
    const a = r();
    const n = 1 + Math.floor(r() * TITLES);
    const side: Side = r() < 0.5 ? "naka" : "sc";
    if (a < 0.3) {
      if (lists[side].has(idOf(n, side))) remove(n, side, "owner");
      else add(n, side, "owner");
    } else if (a < 0.58) {
      const items = state.pending.filter(
        (i): i is PendingItem & { kind: "removal" } => i.kind === "removal",
      );
      const item = items[Math.floor(r() * items.length)];
      if (item) {
        if (a < 0.5) answer(item);
        else remap(item);
      }
    } else {
      await oneRun();
    }
  }
  return violations;
}

describe("sync runner fuzz: never write back a title the owner removed", () => {
  it(`finds no violation over ${SEEDS} fixed seeds`, async () => {
    const violations: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      violations.push(...(await simulate(seed)));
    }
    expect(violations.slice(0, 3)).toEqual([]);
  }, 20_000);
});

// Liveness: pairs that keep failing (poison) must not starve the pairs that
// failed only transiently. No owner edits here. Titles 1..8 are Naka-only
// (written to SensCritique), titles 9..16 SensCritique-only (written to Naka),
// two poison pairs on each side, so 16 additions share the cap of 10 per run.
const LIVE_TITLES = 16;
const LIVE_RUNS = 40;
const LIVE_SEEDS = 200;

async function starved(seed: number): Promise<number[]> {
  const r = rng(seed);
  const poison = new Set<number>();
  while (poison.size < 2) poison.add(1 + Math.floor(r() * 8));
  while (poison.size < 4) poison.add(9 + Math.floor(r() * 8));
  const naka = new Set<number>(Array.from({ length: 8 }, (_, i) => i + 1));
  const sc = new Set<number>(Array.from({ length: 8 }, (_, i) => i + 9 + 1000));
  let state: SyncState = {
    ...emptyState(),
    mapping: Array.from({ length: LIVE_TITLES }, (_, i) => p(i + 1)),
  };
  const fails = (n: number): boolean => poison.has(n) || r() < 0.3;
  const ports = {
    load: async () => state,
    save: async (s: SyncState) => {
      state = s;
    },
    nakaIds: async () => [...naka],
    scWishlistIds: async () => [...sc],
    addToSc: async (id: number) => {
      if (fails(id - 1000)) throw new Error("fail");
      sc.add(id);
    },
    addToNaka: async (id: number) => {
      if (fails(id)) throw new Error("fail");
      naka.add(id);
    },
    describeNaka: async () => undefined,
    describeSc: async () => undefined,
    searchSc: async () => [],
    searchNaka: async () => [],
  };
  for (let run = 0; run < LIVE_RUNS; run++) await runSync(ports);
  return Array.from({ length: LIVE_TITLES }, (_, i) => i + 1).filter(
    (n) => !poison.has(n) && !(naka.has(n) && sc.has(n + 1000)),
  );
}

describe("sync runner fuzz: failing pairs do not starve the others", () => {
  it(`writes every non-poison pair on both sides within ${LIVE_RUNS} runs`, async () => {
    const stuck: string[] = [];
    for (let seed = 1; seed <= LIVE_SEEDS; seed++) {
      const left = await starved(seed);
      if (left.length > 0) stuck.push(`seed ${seed}: ${left.join(",")}`);
    }
    expect(stuck.slice(0, 3)).toEqual([]);
  }, 20_000);
});
