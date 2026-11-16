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
import { runSync, type SyncPorts } from "../src/core/sync-runner";
import type { Candidate, Titled } from "../src/core/title-match";

// Model-based fuzz of the REAL runSync WITH resolution. Every title starts unmapped, so the 20-id
// resolution cap binds; searches and describes fail now and then (429-like), so mappings arrive late;
// some titles have no year on one side and some have homonyms, so questions stay open. The owner edits
// both lists between runs and answers questions as the amended answer contract says (removals: keep,
// remove, remove without effect, asked; ambiguities: a candidate or "none of these").
// The owner tells the truth: an ambiguity answer is the title's own product when it is listed, else
// "none of these", and the owner never wishes a homonym product. Every pairing the runner acts on is
// then a world title. (A wrong answer declares a pairing the world does not have; a write made for it
// follows the owner's latest action, which this oracle cannot judge.)
// Oracle (no waiver), keyed on the world's titles and blind to how the runner decides: a GHOST snapshot
// per title, kept by the mapped-pair snapshot rules as if the title had been mapped all along, from each
// completed run's final lists: set when both ids are listed, kept while at least one is, cleared when
// neither is. A run never writes a title's id to a side while its ghost is set: the id is absent there,
// so the owner removed it while the pair was snapshotted, and that removal is a question.

const TITLES = 30;
const FILMS = 24;
const NO_YEAR_ON_NAKA = new Set([3, 10, 17, 26]);
const NO_YEAR_ON_SC = new Set([1004, 1011, 1018, 1027]);
// Two products one year either side of the title (2000 + n is the homonym product).
const NEAR = new Set([5, 12, 29]);
// A homonym product of the same year.
const SAME = new Set([6, 19, 28]);
const STEPS = 50;
const SEEDS = 300;
// With no owner answer at all, only the cap and the failed searches delay a mapping; the
// searches then fail more often, so the delay spans the owner's edits.
const UNANSWERED_SEEDS = 200;

type Side = "naka" | "sc";

const scOf = (n: number): number => 1000 + n;
const hasHomonym = (n: number): boolean => NEAR.has(n) || SAME.has(n);
const titleOf = (n: number): Titled => ({
  title: n <= FILMS ? `Film ${n}` : `Serie ${n}`,
  year: 1990 + n,
  type: n <= FILMS ? "film" : "serie",
});
const titleNumber = (q: string): number | undefined => {
  const n = Number(q.replace(/^(Film|Serie) /, ""));
  return Number.isInteger(n) && n >= 1 && n <= TITLES ? n : undefined;
};
// The world title of a SensCritique product: 1000 + n is title n; a homonym product 2000 + n is a title
// of its own, with no Naka id (undefined here).
const titleOfProduct = (id: number): number | undefined =>
  id > 1000 && id <= 1000 + TITLES ? id - 1000 : undefined;
const productNumber = (id: number): number => id % 1000;
const scTitled = (id: number): Titled => {
  const base = titleOf(productNumber(id));
  const year = base.year ?? 0;
  if (NEAR.has(productNumber(id))) {
    return { ...base, year: id < 2000 ? year - 1 : year + 1 };
  }
  return base;
};
const yearless = (titled: Titled): Titled => ({
  title: titled.title,
  type: titled.type,
});

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function simulate(seed: number, answers: boolean): Promise<string[]> {
  const r = rng(seed);
  const searchFailure = answers ? 0.15 : 0.8;
  const lists = { naka: new Set<number>(), sc: new Set<number>() };
  // The titles whose ghost snapshot is set after the last completed run.
  const ghost = new Set<number>();
  const violations: string[] = [];
  const log: string[] = [];
  let state: SyncState = emptyState();

  const idOn = (side: Side, n: number): number =>
    side === "naka" ? n : scOf(n);
  const titleOn = (side: Side, id: number): number | undefined =>
    side === "naka" ? id : titleOfProduct(id);
  const enter = (side: Side, id: number): void => {
    lists[side].add(id);
  };
  for (let n = 1; n <= TITLES; n++) {
    if (r() < 0.5) enter("naka", n);
    if (r() < 0.5) enter("sc", scOf(n));
  }

  const flaky = (p: number, what: string): void => {
    if (r() < p) throw new Error(what);
  };
  const searchSc = async (q: string): Promise<Candidate[]> => {
    flaky(searchFailure, "429");
    const n = titleNumber(q);
    if (n === undefined) return [];
    const ids = hasHomonym(n) ? [scOf(n), 2000 + n] : [scOf(n)];
    return ids.map((id) => ({ id, ...scTitled(id) }));
  };
  const searchNaka = async (q: string): Promise<Candidate[]> => {
    flaky(searchFailure, "429");
    const n = titleNumber(q);
    return n === undefined ? [] : [{ id: n, ...titleOf(n) }];
  };

  const checkWrite = (side: Side, id: number): void => {
    const n = titleOn(side, id);
    if (n !== undefined && ghost.has(n)) {
      violations.push(
        `seed ${seed}: write ${side} ${id} | ${log.slice(-12).join("; ")}`,
      );
    }
  };

  const oneRun = async (): Promise<void> => {
    const reads = { naka: [] as number[][], sc: [] as number[][] };
    const read = (side: Side) => async (): Promise<number[]> => {
      if (reads[side].length > 0) flaky(0.2, "re-read");
      else flaky(0.03, "read");
      const list = [...lists[side]];
      reads[side].push(list);
      return list;
    };
    const write = async (side: Side, id: number): Promise<void> => {
      checkWrite(side, id);
      log.push(`runner add ${side} ${id}`);
      flaky(0.2, "write");
      enter(side, id);
    };
    const ports: SyncPorts = {
      load: async () => state,
      save: async (next) => {
        flaky(0.03, "save");
        state = next;
      },
      nakaIds: read("naka"),
      scWishlistIds: read("sc"),
      addToSc: async (id) => {
        await write("sc", id);
        return "added";
      },
      addToNaka: (id) => write("naka", id),
      describeNaka: async (id) => {
        flaky(0.05, "describe");
        const titled = titleOf(id);
        return NO_YEAR_ON_NAKA.has(id) ? yearless(titled) : titled;
      },
      describeSc: async (id) => {
        flaky(0.05, "describe");
        const titled = scTitled(id);
        return NO_YEAR_ON_SC.has(id) ? yearless(titled) : titled;
      },
      searchSc,
      searchNaka,
    };
    try {
      await runSync(ports);
    } catch {
      log.push("run rejected");
      return;
    }
    log.push("run");
    // What the completed run saw at its end: the first read, plus the re-read when there was one.
    const final = (side: Side) => new Set(reads[side].flat());
    const naka = final("naka");
    const sc = final("sc");
    for (let n = 1; n <= TITLES; n++) {
      const inNaka = naka.has(n);
      const inSc = sc.has(scOf(n));
      if (inNaka && inSc) ghost.add(n);
      else if (!inNaka && !inSc) ghost.delete(n);
    }
  };

  const toggle = (side: Side, n: number): void => {
    const id = idOn(side, n);
    if (lists[side].delete(id)) log.push(`owner remove ${side} ${id}`);
    else {
      enter(side, id);
      log.push(`owner add ${side} ${id}`);
    }
  };
  // The owner often comes back to the title they last edited, and now and then changes both sides of
  // one title between two runs (seen in an owner's probe: Naka's copy back and SensCritique's removed in the same gap).
  let lastEdited = 1;
  const ownerEdit = (): void => {
    const n = r() < 0.5 ? lastEdited : 1 + Math.floor(r() * TITLES);
    lastEdited = n;
    if (r() < 0.3) {
      toggle("naka", n);
      toggle("sc", n);
    } else toggle(r() < 0.5 ? "naka" : "sc", n);
  };

  const answerRemoval = (item: PendingItem & { kind: "removal" }): void => {
    const b = r();
    const { pair } = item;
    if (b < 0.25) {
      state = resolvePending(settlePair(state, pair), item);
      log.push(`keep ${pair.nakaId}:${pair.scId}`);
    } else if (b < 0.5) {
      const id = item.removeFrom === "naka" ? pair.nakaId : pair.scId;
      lists[item.removeFrom].delete(id);
      state = resolvePending(state, item);
      log.push(`answer remove ${item.removeFrom} ${id}`);
    } else if (b < 0.75) {
      state = resolvePending(state, item);
      log.push(`answer remove (no effect) ${pair.nakaId}:${pair.scId}`);
    } else {
      state = markAsked(state, pair);
      log.push(`asked ${pair.nakaId}:${pair.scId}`);
    }
  };

  // The amended answer contract, in ONE save. "None of these" keeps the question open with no candidate.
  // A chosen pair: (2) nothing changes when it would evict a settled pair (the owner is shown the
  // conflict and does not confirm); (3) upsert; a pair sharing an id with a pending removal is settled;
  // (4) every question about the same Naka or SensCritique id is resolved; (5) the chosen ids leave the
  // other questions' candidates, and a question left with no candidate stays open with [].
  const sameQuestion = (a: PendingItem, b: PendingItem): boolean =>
    a.kind === "ambiguity" &&
    b.kind === "ambiguity" &&
    a.side === b.side &&
    a.id === b.id;
  const choose = (pair: Pair): void => {
    const evicts = state.mapping.filter(
      (m) =>
        (m.nakaId === pair.nakaId || m.scId === pair.scId) &&
        !(m.nakaId === pair.nakaId && m.scId === pair.scId),
    );
    const settled = (m: Pair): boolean =>
      state.settled.some((s) => s.nakaId === m.nakaId && s.scId === m.scId);
    if (evicts.some(settled)) {
      log.push(`conflict ${pair.nakaId}:${pair.scId}`);
      return;
    }
    const heldByRemoval = state.pending.some(
      (i) =>
        i.kind === "removal" &&
        (i.pair.nakaId === pair.nakaId || i.pair.scId === pair.scId),
    );
    const mapped = upsertMapping(state, pair);
    const next = heldByRemoval ? settlePair(mapped, pair) : mapped;
    const pending = next.pending.flatMap((i): PendingItem[] => {
      if (i.kind !== "ambiguity") return [i];
      const own = i.side === "naka" ? pair.nakaId : pair.scId;
      if (i.id === own) return [];
      const drop = i.side === "naka" ? pair.scId : pair.nakaId;
      return [{ ...i, candidateIds: i.candidateIds.filter((c) => c !== drop) }];
    });
    state = { ...next, pending };
    log.push(`choose ${pair.nakaId}:${pair.scId}`);
  };
  const truth = (
    item: PendingItem & { kind: "ambiguity" },
  ): number | undefined => {
    const n = item.side === "naka" ? item.id : titleOfProduct(item.id);
    if (n === undefined) return undefined;
    const own = item.side === "naka" ? scOf(n) : n;
    return item.candidateIds.includes(own) ? own : undefined;
  };
  const answerAmbiguity = (item: PendingItem & { kind: "ambiguity" }): void => {
    const chosen = truth(item);
    if (chosen === undefined || r() < 0.25) {
      state = {
        ...state,
        pending: state.pending.map((i) =>
          sameQuestion(i, item) ? { ...item, candidateIds: [] } : i,
        ),
      };
      log.push(`none of these ${item.side} ${item.id}`);
      return;
    }
    choose(
      item.side === "naka"
        ? { nakaId: item.id, scId: chosen }
        : { nakaId: chosen, scId: item.id },
    );
  };
  const answer = (): void => {
    const item = state.pending[Math.floor(r() * state.pending.length)];
    if (item?.kind === "removal") answerRemoval(item);
    if (item?.kind === "ambiguity") answerAmbiguity(item);
  };

  for (let step = 0; step < STEPS; step++) {
    const a = r();
    if (a < 0.25) ownerEdit();
    else if (a < 0.45) {
      if (answers) answer();
    } else await oneRun();
  }
  return violations;
}

describe("sync runner fuzz with resolution: never write back a title seen in both lists", () => {
  it.each([
    ["with the owner's answers", true, SEEDS],
    [
      "with no answer (the cap and failed searches only)",
      false,
      UNANSWERED_SEEDS,
    ],
  ] as const)(
    "finds no violation %s",
    async (_name, answers, seeds) => {
      const violations: string[] = [];
      for (let seed = 1; seed <= seeds; seed++) {
        violations.push(...(await simulate(seed, answers)));
      }
      expect({
        count: violations.length,
        first: violations.slice(0, 3),
      }).toEqual({ count: 0, first: [] });
    },
    20_000,
  );
});
