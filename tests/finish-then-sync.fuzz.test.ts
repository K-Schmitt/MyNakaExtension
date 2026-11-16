import { describe, expect, it } from "vitest";
import {
  type FinishEvent,
  type FinishPorts,
  handleFinish,
} from "../src/core/finish-handler";
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
import { DEFAULT_THRESHOLDS } from "../src/core/watch-trigger";
import { UNIVERSE } from "../src/sc/sc-queries";

// Model-based fuzz of the finish handler and the REAL runSync on one world. The
// owner edits both lists, writes, reads and saves fail on both handlers, and the
// Plan-3 answers arrive between steps: removals (keep, remove, no effect,
// asked) and the owner's choice on any open question, made as the answer contract
// says (one save: the chosen pair upserted, every open question about the same
// Naka id or the same SensCritique id resolved), followed by the explicit
// replay of the stored finish.
// Some titles are described WITHOUT a year by one side, so the runner leaves a
// question open on them (Naka side for 3 and 12, SensCritique side for 1004 and
// 1011) while the finish events, which carry the year, would match them alone.
// Film 6 has a homonym of the same year (2006). Film 5 has two products one
// year either side (1005 in 2004, 2005 in 2006): Naka asks about 5 while each
// product, searched on Naka, finds 5 alone, the review's probe state.
// Oracle 1: once a film's finish returned done, or rejected after one of its
// saves succeeded, or once the handler's own unwish or markDone of the film
// succeeded, no later run calls addToSc with that film's SensCritique id. (The
// write triggers do not depend on when the handler saves: they also catch a
// handler that writes before it saves anything.)
// Oracle 2: unwish is only ever called with a film's SensCritique id.
// Oracle 3 (no waiver): a finish writes nothing while a Naka-side question on
// its title is open, mapped or not, nor to a product (or an episode of a series
// product) with an open SensCritique-side question.
// State invariant: after every run and every finish, no mapped pair has an open
// question on its Naka id or on its SensCritique id.
// Answers follow the amended answer contract: "none of these" keeps the question
// open with no candidate, and the chosen ids leave the other questions'
// candidates, a question left with none staying open.

const FILMS = [1, 2, 3, 4, 5, 6];
const SERIES = [11, 12];
const TITLES = [...FILMS, ...SERIES];
const HOMONYMS: Record<number, number> = { 5: 2005, 6: 2006 };
const SC_YEARS: Record<number, number> = { 1005: 2004, 2005: 2006 };
const EPISODES = 3;
const STEPS = 40;
const SEEDS = 1000;

type Side = "naka" | "sc";

const scOf = (n: number): number => n + 1000;
const isFilm = (n: number): boolean => FILMS.includes(n);
const isFilmSc = (id: number): boolean =>
  FILMS.some((n) => scOf(n) === id || HOMONYMS[n] === id);
const titleOfProduct = (id: number): number =>
  id >= 2000 ? id - 2000 : id - 1000;
const universeOf = (id: number): number => {
  if (isFilmSc(id)) return UNIVERSE.film;
  return SERIES.some((n) => scOf(n) === id) ? UNIVERSE.serie : UNIVERSE.episode;
};
const titleOf = (n: number): Titled =>
  isFilm(n)
    ? { title: `Film ${n}`, year: 2000 + n, type: "film" }
    : { title: `Serie ${n}`, year: 2010 + n, type: "serie" };
const titleNumber = (q: string): number | undefined =>
  TITLES.find((n) => titleOf(n).title === q);
const NO_YEAR_ON_NAKA = [3, 12];
const NO_YEAR_ON_SC = [scOf(4), scOf(11)];
const yearless = (titled: Titled, drop: boolean): Titled =>
  drop ? { title: titled.title, type: titled.type } : titled;
const nakaView = (id: number): Titled =>
  yearless(titleOf(id), NO_YEAR_ON_NAKA.includes(id));
const scTitled = (id: number): Titled => {
  const titled = titleOf(titleOfProduct(id));
  const year = SC_YEARS[id];
  return year === undefined ? titled : { ...titled, year };
};
const scView = (id: number): Titled =>
  yearless(scTitled(id), NO_YEAR_ON_SC.includes(id));
// Episode products are 5000 + series product * 10 + episode (1..3).
const ownerOf = (productId: number): number =>
  productId >= 5000 ? Math.floor((productId - 5001) / 10) : productId;

function scCandidates(q: string): Candidate[] {
  const n = titleNumber(q);
  if (n === undefined) return [];
  const homonym = HOMONYMS[n];
  const ids = homonym === undefined ? [scOf(n)] : [scOf(n), homonym];
  return ids.map((id) => ({ id, ...scTitled(id) }));
}

function nakaCandidates(q: string): Candidate[] {
  const n = titleNumber(q);
  return n === undefined ? [] : [{ id: n, ...titleOf(n) }];
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function simulate(seed: number): Promise<string[]> {
  const r = rng(seed);
  const lists = { naka: new Set<number>(), sc: new Set<number>() };
  const done = new Set<number>();
  for (const n of TITLES) {
    if (r() < 0.6) lists.naka.add(n);
    if (r() < 0.6) lists.sc.add(scOf(n));
    if (isFilm(n) && r() < 0.2) done.add(scOf(n));
  }
  let state: SyncState = {
    ...emptyState(),
    mapping: TITLES.filter((n) => !(n in HOMONYMS) && r() < 0.5).map((n) => ({
      nakaId: n,
      scId: scOf(n),
    })),
  };
  const guarded = new Map<number, string>();
  const replays = new Map<number, FinishEvent>();
  const violations: string[] = [];
  const log: string[] = [];
  let saves = 0;
  const flaky = (p: number, what: string): void => {
    if (r() < p) throw new Error(what);
  };

  const ports: FinishPorts & SyncPorts = {
    load: async () => state,
    save: async (next) => {
      flaky(0.1, "save");
      state = next;
      saves += 1;
    },
    nakaIds: async () => [...lists.naka],
    scWishlistIds: async () => [...lists.sc],
    addToSc: async (id) => {
      if (guarded.has(id)) {
        violations.push(
          `seed ${seed}: addToSc ${id} after ${guarded.get(id)} | ${log.slice(-8).join("; ")}`,
        );
      }
      log.push(`run addToSc ${id}`);
      flaky(0.2, "addToSc");
      // The live writer reads the product state first and never wishes a product already done.
      if (done.has(id)) return "already-done";
      lists.sc.add(id);
      return "added";
    },
    addToNaka: async (id) => {
      log.push(`run addToNaka ${id}`);
      flaky(0.2, "addToNaka");
      lists.naka.add(id);
    },
    describeNaka: async (id) => nakaView(id),
    describeSc: async (id) => scView(id),
    searchNaka: async (q) => nakaCandidates(q),
    searchSc: async (q) => scCandidates(q),
    productState: async (id) => {
      flaky(0.05, "productState");
      return {
        isDone: done.has(id),
        isWished: lists.sc.has(id),
        universe: universeOf(id),
        rating: null,
        average: null,
        dateDone: null,
        isReviewed: false,
        isRecommended: false,
        url: undefined,
      };
    },
    unwish: async (id) => {
      if (!isFilmSc(id)) violations.push(`seed ${seed}: unwish ${id}`);
      log.push(`finish unwish ${id}`);
      flaky(0.2, "unwish");
      lists.sc.delete(id);
      guarded.set(id, "its unwish");
    },
    markDone: async (id) => {
      log.push(`finish markDone ${id}`);
      flaky(0.25, "markDone");
      done.add(id);
      if (isFilmSc(id)) guarded.set(id, "its markDone");
    },
    seasonInfo: async (id, season) => ({
      seasonProductId: 4000 + id,
      episodes: Array.from({ length: EPISODES }, (_, i) => ({
        productId: 5000 + id * 10 + i + 1,
        season,
        episode: i + 1,
        title: `Episode ${i + 1}`,
        average: null,
      })),
    }),
    today: () => "2026-11-03",
  };

  const scIdOf = (n: number): number =>
    state.mapping.find((m) => m.nakaId === n)?.scId ?? scOf(n);
  const ownerEdit = (n: number, side: Side): void => {
    const id = side === "naka" ? n : scIdOf(n);
    if (lists[side].delete(id)) log.push(`owner remove ${side} ${id}`);
    else {
      lists[side].add(id);
      log.push(`owner add ${side} ${id}`);
    }
  };

  // The questions a finish must not decide behind the owner's back (oracle 3, no waiver).
  const openQuestions = (n: number) => {
    const asked = (side: Side) =>
      state.pending.flatMap((i) =>
        i.kind === "ambiguity" && i.side === side ? [i.id] : [],
      );
    return {
      onTitle: asked("naka").includes(n),
      onProducts: new Set(asked("sc")),
    };
  };

  const checkInvariant = (after: string): void => {
    for (const pair of state.mapping) {
      const asked = state.pending.some(
        (i) =>
          i.kind === "ambiguity" &&
          ((i.side === "naka" && i.id === pair.nakaId) ||
            (i.side === "sc" && i.id === pair.scId)),
      );
      if (asked) {
        violations.push(
          `seed ${seed}: invariant after ${after}: mapped ${pair.nakaId}:${pair.scId} has an open question | ${log.slice(-8).join("; ")}`,
        );
      }
    }
  };

  // The film path reads the product state of the film exactly once, before its first save.
  const finish = async (event: FinishEvent): Promise<void> => {
    const before = saves;
    let filmSc: number | undefined;
    const open = openQuestions(event.naka.contentId);
    const written: number[] = [];
    const tracked: FinishPorts = {
      ...ports,
      productState: (id) => {
        if (event.naka.mediaType === "movie") filmSc = id;
        return ports.productState(id);
      },
      unwish: (id) => {
        written.push(id);
        return ports.unwish(id);
      },
      markDone: (id, date) => {
        written.push(id);
        return ports.markDone(id, date);
      },
    };
    const name = `finish ${event.naka.contentId} ${event.source}`;
    const checkQuestions = (): void => {
      for (const id of written) {
        if (open.onTitle || open.onProducts.has(ownerOf(id))) {
          violations.push(
            `seed ${seed}: ${name} wrote ${id} while a question was open | ${log.slice(-8).join("; ")}`,
          );
        }
      }
    };
    try {
      const outcome = await handleFinish(event, tracked, DEFAULT_THRESHOLDS);
      log.push(`${name} ${outcome.kind}`);
      if (outcome.kind === "done" && filmSc !== undefined) {
        guarded.set(filmSc, `${name} done`);
      }
      if (outcome.kind === "needs-choice") {
        replays.set(event.naka.contentId, { ...event, source: "explicit" });
      }
    } catch {
      log.push(`${name} rejected`);
      if (filmSc !== undefined && saves > before) {
        guarded.set(filmSc, `${name} rejected after a save`);
      }
    }
    checkQuestions();
    checkInvariant(name);
  };

  const eventFor = (n: number): FinishEvent => {
    const source = r() < 0.5 ? "threshold" : "explicit";
    const progress = r();
    if (isFilm(n)) {
      return {
        source,
        progress,
        naka: { contentId: n, mediaType: "movie" },
        titled: titleOf(n),
      };
    }
    const number = 1 + Math.floor(r() * (EPISODES + 1));
    return {
      source,
      progress,
      naka: { contentId: n, mediaType: "tv", season: 1, episode: number },
      titled: titleOf(n),
    };
  };

  const answerRemoval = (item: PendingItem & { kind: "removal" }): void => {
    const b = r();
    if (b < 0.25) {
      state = resolvePending(settlePair(state, item.pair), item);
      log.push(`keep ${item.pair.nakaId}`);
    } else if (b < 0.5) {
      const id = item.removeFrom === "naka" ? item.pair.nakaId : item.pair.scId;
      lists[item.removeFrom].delete(id);
      state = resolvePending(state, item);
      log.push(`answer remove ${item.removeFrom} ${id}`);
    } else if (b < 0.75) {
      state = resolvePending(state, item);
      log.push(`answer remove (no effect) ${item.pair.nakaId}`);
    } else {
      state = markAsked(state, item.pair);
    }
  };

  // The answer contract: ONE save that upserts the chosen pair and resolves every
  // open ambiguity about the same Naka id or the same SensCritique id.
  const answerAmbiguity = async (
    item: PendingItem & { kind: "ambiguity" },
  ): Promise<void> => {
    const chosen =
      item.candidateIds[Math.floor(r() * item.candidateIds.length)];
    if (chosen === undefined || r() < 0.25) {
      await noneOfThese(item);
      return;
    }
    const pair =
      item.side === "naka"
        ? { nakaId: item.id, scId: chosen }
        : { nakaId: chosen, scId: item.id };
    const about = (i: PendingItem): boolean =>
      i.kind === "ambiguity" &&
      ((i.side === "naka" && i.id === pair.nakaId) ||
        (i.side === "sc" && i.id === pair.scId));
    const taken = (i: PendingItem): PendingItem =>
      i.kind === "ambiguity"
        ? {
            ...i,
            candidateIds: i.candidateIds.filter(
              (id) => id !== (i.side === "naka" ? pair.scId : pair.nakaId),
            ),
          }
        : i;
    const mapped = upsertMapping(state, pair);
    state = {
      ...mapped,
      pending: mapped.pending.filter((i) => !about(i)).map(taken),
    };
    log.push(`choose ${pair.nakaId} -> ${pair.scId}`);
    const replay = replays.get(pair.nakaId);
    replays.delete(pair.nakaId);
    if (replay) await finish(replay);
  };

  // "None of these": the question stays open with no candidate; the stored
  // finish of the title is replayed, and asks again with no write.
  const noneOfThese = async (
    item: PendingItem & { kind: "ambiguity" },
  ): Promise<void> => {
    state = {
      ...state,
      pending: state.pending.map((i) =>
        i.kind === "ambiguity" && i.side === item.side && i.id === item.id
          ? { ...i, candidateIds: [] }
          : i,
      ),
    };
    log.push(`none of these ${item.side} ${item.id}`);
    const replay = item.side === "naka" ? replays.get(item.id) : undefined;
    replays.delete(item.id);
    if (replay) await finish(replay);
  };

  const answer = async (): Promise<void> => {
    const item = state.pending[Math.floor(r() * state.pending.length)];
    if (item?.kind === "removal") answerRemoval(item);
    if (item?.kind === "ambiguity") await answerAmbiguity(item);
  };

  for (let step = 0; step < STEPS; step++) {
    const a = r();
    const n = TITLES[Math.floor(r() * TITLES.length)] ?? 1;
    if (a < 0.25) ownerEdit(n, r() < 0.5 ? "naka" : "sc");
    else if (a < 0.4) await answer();
    else if (a < 0.7) await finish(eventFor(n));
    else {
      try {
        await runSync(ports);
        log.push("run");
      } catch {
        log.push("run rejected");
      }
      checkInvariant("a run");
    }
  }
  return violations;
}

describe("finish then sync fuzz: a finished film is never re-wished", () => {
  it(`finds no violation over ${SEEDS} fixed seeds`, async () => {
    const violations: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      violations.push(...(await simulate(seed)));
    }
    expect({
      count: violations.length,
      first: violations.slice(0, 3),
    }).toEqual({ count: 0, first: [] });
  }, 20_000);
});
