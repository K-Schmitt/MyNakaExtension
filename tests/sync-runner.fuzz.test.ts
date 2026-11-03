import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import {
  emptyState,
  markAsked,
  type PendingItem,
  resolvePending,
  type SyncState,
  settlePair,
} from "../src/core/state";
import { runSync } from "../src/core/sync-runner";

// Model-based fuzz of the real runSync. The owner edits both lists (also in
// the middle of a run), writes fail or have no effect, re-reads reject and the
// Plan-3 answers (keep, remove, remove without effect, asked) arrive between
// runs. Oracle: the runner never writes a title back to a side after the
// owner removed it there, once a completed run had seen the pair in both lists.

const TITLES = 6;
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

const idOf = (n: number, side: Side): number =>
  side === "naka" ? n : n + 1000;

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
  const log: string[] = [];
  const violations: string[] = [];

  const remove = (n: number, side: Side, who: string): void => {
    const both = lists.naka.has(n) && lists.sc.has(n + 1000);
    if (!lists[side].delete(idOf(n, side))) return;
    if (both && seenBoth.has(n)) protectedFrom.set(n, side);
    seenBoth.delete(n);
    log.push(`${who} remove ${side} ${n}`);
  };
  const add = (n: number, side: Side, who: string): void => {
    if (lists[side].has(idOf(n, side))) return;
    lists[side].add(idOf(n, side));
    protectedFrom.delete(n);
    log.push(`${who} add ${side} ${n}`);
  };
  const answer = (item: PendingItem & { kind: "removal" }): void => {
    const b = r();
    if (b < 0.25) {
      state = resolvePending(settlePair(state, item.pair), item);
      log.push(`keep ${item.pair.nakaId}`);
    } else if (b < 0.5) {
      remove(item.pair.nakaId, item.removeFrom, "plan3");
      state = resolvePending(state, item);
      log.push(`answer remove ${item.removeFrom} ${item.pair.nakaId}`);
    } else if (b < 0.75) {
      state = resolvePending(state, item);
      log.push(`answer remove (no effect) ${item.pair.nakaId}`);
    } else {
      state = markAsked(state, item.pair);
      log.push(`asked ${item.pair.nakaId}`);
    }
  };

  const oneRun = async (): Promise<void> => {
    const start = { naka: new Set(lists.naka), sc: new Set(lists.sc) };
    let nakaReads = 0;
    let scReads = 0;
    let firstNakaRead: number[] = [];
    let lastNaka: number[] = [];
    let lastSc: number[] = [];
    const write = async (side: Side, id: number): Promise<void> => {
      const n = side === "naka" ? id : id - 1000;
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
            if (list.includes(k + 1000)) seenBoth.add(k);
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
    // The completed run also saw, through its re-reads, titles the owner added mid-run.
    for (let k = 1; k <= TITLES; k++) {
      if (lastNaka.includes(k) && lastSc.includes(k + 1000)) seenBoth.add(k);
    }
  };

  for (let step = 0; step < STEPS; step++) {
    const a = r();
    const n = 1 + Math.floor(r() * TITLES);
    const side: Side = r() < 0.5 ? "naka" : "sc";
    if (a < 0.3) {
      if (lists[side].has(idOf(n, side))) remove(n, side, "owner");
      else add(n, side, "owner");
    } else if (a < 0.5) {
      const items = state.pending.filter(
        (i): i is PendingItem & { kind: "removal" } => i.kind === "removal",
      );
      const item = items[Math.floor(r() * items.length)];
      if (item) answer(item);
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
  });
});
