import { describe, expect, it } from "vitest";
import {
  type FinishEvent,
  type FinishPorts,
  handleFinish,
} from "../src/core/finish-handler";
import type { Pair } from "../src/core/list-diff";
import { chooseNone } from "../src/core/questions";
import { emptyState, type SyncState, upsertMapping } from "../src/core/state";
import { runSync, type SyncPorts } from "../src/core/sync-runner";
import type { Candidate, Titled } from "../src/core/title-match";
import { DEFAULT_THRESHOLDS } from "../src/core/watch-trigger";
import { UNIVERSE } from "../src/sc/sc-queries";

// One in-memory world shared by the finish handler and the REAL sync runner.
// On SensCritique, "wished" is membership of the wishlist itself: unwish removes
// the film from the list the runner reads.

const TODAY = "2026-11-03";
const FILM = 42;
const FILM_SC = 1042;
const SERIES = 7;
const SERIES_SC = 1007;
const FILM_PAIR: Pair = { nakaId: FILM, scId: FILM_SC };
const SERIES_PAIR: Pair = { nakaId: SERIES, scId: SERIES_SC };
const FILM_TITLE: Titled = { title: "Le Film", year: 2001, type: "film" };
const SERIES_TITLE: Titled = { title: "La Série", year: 2010, type: "serie" };

const NAKA_TITLES: Record<number, Titled> = {
  [FILM]: FILM_TITLE,
  [SERIES]: SERIES_TITLE,
};
const SC_TITLES: Record<number, Titled> = {
  [FILM_SC]: FILM_TITLE,
  [SERIES_SC]: SERIES_TITLE,
};

// The film is 1042 (and its homonym 2042), the series 1007 (and its homonym 2007); episodes are
// 10071 and up.
const universeOf = (id: number): number => {
  if (id === FILM_SC || id === 2042) return UNIVERSE.film;
  return id === SERIES_SC || id === 2007 ? UNIVERSE.serie : UNIVERSE.episode;
};

// Plan 3's answer (contract): ONE save that upserts the chosen pair and resolves every open
// ambiguity about the same Naka id or the same SensCritique id.
function answer(state: SyncState, pair: Pair): SyncState {
  const about = (item: SyncState["pending"][number]): boolean =>
    item.kind === "ambiguity" &&
    ((item.side === "naka" && item.id === pair.nakaId) ||
      (item.side === "sc" && item.id === pair.scId));
  const mapped = upsertMapping(state, pair);
  return { ...mapped, pending: mapped.pending.filter((item) => !about(item)) };
}

function candidates(titles: Record<number, Titled>, q: string): Candidate[] {
  return Object.entries(titles)
    .filter(([, titled]) => titled.title === q)
    .map(([id, titled]) => ({ id: Number(id), ...titled }));
}

type Opts = {
  naka: number[];
  sc: number[];
  state?: Partial<SyncState>;
  failMarkDone?: number;
  nakaTitles?: Record<number, Titled>;
  // What the Naka search returns (default: nakaTitles); describeNaka reads nakaTitles.
  nakaCatalogue?: Record<number, Titled>;
  scTitles?: Record<number, Titled>;
};

function world(o: Opts) {
  const NAKA = o.nakaTitles ?? NAKA_TITLES;
  const CATALOGUE = o.nakaCatalogue ?? NAKA;
  const SC = o.scTitles ?? SC_TITLES;
  const w = {
    naka: new Set(o.naka),
    sc: new Set(o.sc),
    done: new Set<number>(),
    state: { ...emptyState(), ...o.state } as SyncState,
    writes: [] as string[],
    reads: [] as string[],
    failMarkDone: o.failMarkDone ?? 0,
  };
  const ports: FinishPorts & SyncPorts = {
    load: async () => w.state,
    save: async (state) => {
      w.state = state;
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
    },
    describeNaka: async (id) => {
      w.reads.push(`describeNaka:${id}`);
      return NAKA[id];
    },
    describeSc: async (id) => {
      w.reads.push(`describeSc:${id}`);
      return SC[id];
    },
    searchNaka: async (q) => {
      w.reads.push(`searchNaka:${q}`);
      return candidates(CATALOGUE, q);
    },
    searchSc: async (q) => {
      w.reads.push(`searchSc:${q}`);
      return candidates(SC, q);
    },
    productState: async (id) => ({
      isDone: w.done.has(id),
      isWished: w.sc.has(id),
      universe: universeOf(id),
      rating: null,
      average: null,
    }),
    unwish: async (id) => {
      w.writes.push(`unwish:${id}`);
      w.sc.delete(id);
    },
    markDone: async (id) => {
      w.writes.push(`markDone:${id}`);
      if (w.failMarkDone > 0) {
        w.failMarkDone -= 1;
        throw new Error("markDone failed");
      }
      w.done.add(id);
    },
    seasonInfo: async (id, season) => ({
      seasonProductId: 4000 + season,
      episodes: [1, 2, 3].map((e) => ({
        productId: id * 10 + e,
        season,
        episode: e,
        title: `Épisode ${e}`,
        average: null,
      })),
    }),
    today: () => TODAY,
  };
  return { w, ports };
}

function film(over: Partial<FinishEvent> = {}): FinishEvent {
  return {
    source: "threshold",
    progress: 0.96,
    naka: { contentId: FILM, mediaType: "movie" },
    titled: FILM_TITLE,
    ...over,
  };
}

function episode(number: number): FinishEvent {
  return {
    source: "threshold",
    progress: 0.95,
    naka: { contentId: SERIES, mediaType: "tv", season: 1, episode: number },
    titled: SERIES_TITLE,
  };
}

async function settle(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // the rejection itself is asserted by the test that needs it
  }
}

const listWrites = (writes: string[]): string[] =>
  writes.filter((w) => w.startsWith("addTo"));

const pendingRemovals = (state: SyncState) =>
  state.pending.filter((item) => item.kind === "removal");

describe("a film finish, then the sync", () => {
  it("the plan's composite: no runner call after the finish, over two runs", async () => {
    const { w, ports } = world({
      naka: [FILM],
      sc: [FILM_SC],
      state: { mapping: [FILM_PAIR], snapshot: [FILM_PAIR] },
    });
    expect((await handleFinish(film(), ports, DEFAULT_THRESHOLDS)).kind).toBe(
      "done",
    );
    expect([...w.sc]).toEqual([]);
    for (const _run of [1, 2]) {
      const report = await runSync(ports);
      expect(report.added).toEqual([]);
      expect(report.pendingRemovals).toBe(0);
      expect(pendingRemovals(w.state)).toEqual([]);
    }
    expect(w.writes).toEqual(["unwish:1042", "markDone:1042"]);
    expect([...w.naka]).toEqual([FILM]);
  });

  it("a film found by search: no write, no question, and the resolver never reads it", async () => {
    const { w, ports } = world({ naka: [FILM], sc: [FILM_SC] });
    expect((await handleFinish(film(), ports, DEFAULT_THRESHOLDS)).kind).toBe(
      "done",
    );
    const readsAfterFinish = w.reads.length;
    await runSync(ports);
    await runSync(ports);
    expect(w.writes).toEqual(["unwish:1042", "markDone:1042"]);
    expect(w.state.pending).toEqual([]);
    expect(w.reads.slice(readsAfterFinish)).toEqual([]);
  });

  it("a crash between the writes: the run re-adds nothing, and an explicit retry only marks it done", async () => {
    const { w, ports } = world({
      naka: [FILM],
      sc: [FILM_SC],
      failMarkDone: 1,
    });
    await expect(
      handleFinish(film(), ports, DEFAULT_THRESHOLDS),
    ).rejects.toThrow("markDone failed");
    expect(w.writes).toEqual(["unwish:1042", "markDone:1042"]);
    const state1 = {
      ...emptyState(),
      mapping: [FILM_PAIR],
      settled: [FILM_PAIR],
    };
    expect(w.state).toStrictEqual(state1);
    await runSync(ports);
    expect(listWrites(w.writes)).toEqual([]);
    expect(w.state.pending).toEqual([]);
    const retry = await handleFinish(
      film({ source: "explicit", progress: 0.2 }),
      ports,
      DEFAULT_THRESHOLDS,
    );
    expect(retry).toEqual({
      kind: "done",
      ratingTargets: [{ label: "film", productId: FILM_SC, current: null }],
    });
    expect(w.writes).toEqual(["unwish:1042", "markDone:1042", "markDone:1042"]);
    expect(w.state.handled).toEqual(["movie:42"]);
    await runSync(ports);
    expect(listWrites(w.writes)).toEqual([]);
  });

  it.each([
    ["every write succeeds", 0],
    ["markDone rejects after the unwish", 1],
  ])(
    "a mapped film not snapshotted yet is never re-wished (%s)",
    async (_name, failMarkDone) => {
      const { w, ports } = world({
        naka: [FILM],
        sc: [FILM_SC],
        state: { mapping: [FILM_PAIR] },
        failMarkDone,
      });
      await settle(handleFinish(film(), ports, DEFAULT_THRESHOLDS));
      expect(w.writes.slice(0, 1)).toEqual(["unwish:1042"]);
      expect(w.sc.has(FILM_SC)).toBe(false);
      await runSync(ports);
      await runSync(ports);
      expect(listWrites(w.writes)).toEqual([]);
      expect(w.sc.has(FILM_SC)).toBe(false);
      expect(w.state.pending).toEqual([]);
    },
  );
});

describe("the owner's open question, the finish, the answer and the replay", () => {
  it.each([
    ["the homonym 2042", 2042, ["markDone:2042"]],
    ["the runner's near match 1042", FILM_SC, ["unwish:1042", "markDone:1042"]],
  ])(
    "the probe: the finish asks, then the owner picks %s and the replay finishes it",
    async (_name, chosen, writes) => {
      const { w, ports } = world({
        naka: [FILM],
        sc: [FILM_SC],
        nakaTitles: { [FILM]: FILM_TITLE },
        scTitles: {
          [FILM_SC]: { ...FILM_TITLE, year: 2000 },
          2042: { ...FILM_TITLE, year: 2002 },
        },
      });
      await runSync(ports);
      expect(await handleFinish(film(), ports, DEFAULT_THRESHOLDS)).toEqual({
        kind: "needs-choice",
        candidateIds: [FILM_SC, 2042],
      });
      expect(w.writes).toEqual([]);
      await ports.save(answer(w.state, { nakaId: FILM, scId: chosen }));
      const replay = await handleFinish(
        film({ source: "explicit" }),
        ports,
        DEFAULT_THRESHOLDS,
      );
      expect(replay).toEqual({
        kind: "done",
        ratingTargets: [{ label: "film", productId: chosen, current: null }],
      });
      await runSync(ports);
      await runSync(ports);
      expect(w.writes).toEqual(writes);
      expect(w.state.mapping).toEqual([{ nakaId: FILM, scId: chosen }]);
      expect(
        w.state.pending.filter(
          (item) => item.kind === "ambiguity" && item.side === "naka",
        ),
      ).toEqual([]);
    },
  );
});

describe("episode finishes, then the sync", () => {
  it("three episodes: the series stays in both lists and the runner does nothing", async () => {
    const { w, ports } = world({
      naka: [SERIES],
      sc: [SERIES_SC],
      state: { mapping: [SERIES_PAIR], snapshot: [SERIES_PAIR] },
    });
    for (const number of [1, 2, 3]) {
      expect(
        (await handleFinish(episode(number), ports, DEFAULT_THRESHOLDS)).kind,
      ).toBe("done");
    }
    expect(w.writes).toEqual([
      "markDone:10071",
      "markDone:10072",
      "markDone:10073",
    ]);
    const report = await runSync(ports);
    expect(report.added).toEqual([]);
    expect(report.pendingRemovals).toBe(0);
    expect(w.writes).toHaveLength(3);
    expect([...w.naka]).toEqual([SERIES]);
    expect([...w.sc]).toEqual([SERIES_SC]);
    expect(w.state.pending).toEqual([]);
    expect(w.state.settled).toEqual([]);
    expect(w.state.snapshot).toEqual([SERIES_PAIR]);
  });

  it("V1: a question the runner left open on the series is not decided by an episode finish", async () => {
    const { w, ports } = world({
      naka: [SERIES],
      sc: [],
      nakaTitles: { [SERIES]: { title: "La Série", type: "serie" } },
      scTitles: {
        [SERIES_SC]: SERIES_TITLE,
        2007: { title: "La Série", year: 1990, type: "serie" },
      },
    });
    await runSync(ports);
    const asked = {
      kind: "ambiguity",
      side: "naka",
      id: SERIES,
      candidateIds: [SERIES_SC, 2007],
      title: "La Série",
      candidates: [
        { id: SERIES_SC, title: "La Série", year: 2010, type: "serie" },
        { id: 2007, title: "La Série", year: 1990, type: "serie" },
      ],
    };
    expect(w.state.pending).toEqual([asked]);
    expect(await handleFinish(episode(1), ports, DEFAULT_THRESHOLDS)).toEqual({
      kind: "needs-choice",
      candidateIds: [SERIES_SC, 2007],
    });
    const waiting = { ...asked, finish: `tv:${SERIES}:S1E1` };
    expect(w.state.pending).toEqual([waiting]);
    await runSync(ports);
    expect(w.writes).toEqual([]);
    expect(w.state.mapping).toEqual([]);
    expect(w.state.pending).toEqual([waiting]);
  });
});

// Plan 3's amended answer contract: "none of these" keeps the question OPEN with no candidate, and so
// does a question whose candidates another answer took (steps 5 and 6). The open question then stops
// the finish (it asks again, with no write) and the other direction of the sync (G1).
function noneOfThese(state: SyncState, side: "naka" | "sc", id: number) {
  const out = chooseNone(state, side, id);
  if (!out) throw new Error("expected an open question");
  return out;
}

// Steps 3 to 5: the chosen pair is upserted, the questions about its own ids are resolved, and its ids
// leave the other questions' candidates; a question left with no candidate stays open.
function answerByContract(state: SyncState, pair: Pair): SyncState {
  const mapped = answer(state, pair);
  return {
    ...mapped,
    pending: mapped.pending.map((item) => {
      if (item.kind !== "ambiguity") return item;
      const taken = item.side === "naka" ? pair.scId : pair.nakaId;
      return {
        ...item,
        candidateIds: item.candidateIds.filter((id) => id !== taken),
        candidates: item.candidates?.filter((c) => c.id !== taken),
      };
    }),
  };
}

describe("the owner answers 'none of these' (amended contract)", () => {
  // Naka's catalogue entry has no release date for the describe, so the runner asks about 42.
  const yearless = () =>
    world({
      naka: [FILM],
      sc: [],
      nakaTitles: { [FILM]: { title: "Le Film", type: "film" } },
      nakaCatalogue: { [FILM]: FILM_TITLE },
      scTitles: { [FILM_SC]: FILM_TITLE },
    });
  const asked = (
    side: "naka" | "sc",
    id: number,
    candidateIds: number[],
    finish?: string,
  ) => ({
    kind: "ambiguity",
    side,
    id,
    candidateIds,
    title: "Le Film",
    candidates: candidateIds.map((cid) => ({ id: cid, ...FILM_TITLE })),
    ...(finish === undefined ? {} : { finish }),
  });

  it("P1: a finish carrying the year writes nothing to the rejected product and asks again", async () => {
    const { w, ports } = yearless();
    await runSync(ports);
    expect(w.state.pending).toEqual([asked("naka", FILM, [FILM_SC])]);
    w.state = noneOfThese(w.state, "naka", FILM);
    expect(await handleFinish(film(), ports, DEFAULT_THRESHOLDS)).toEqual({
      kind: "needs-choice",
      candidateIds: [],
    });
    expect(w.writes).toEqual([]);
    expect(w.state.mapping).toEqual([]);
    expect(w.state.pending).toEqual([asked("naka", FILM, [], `movie:${FILM}`)]);
  });

  it("P1b: the explicit replay of the stored finish writes nothing either", async () => {
    const { w, ports } = yearless();
    await runSync(ports);
    w.state = noneOfThese(w.state, "naka", FILM);
    const replay = film({ source: "explicit", progress: 0.1 });
    expect(await handleFinish(replay, ports, DEFAULT_THRESHOLDS)).toEqual({
      kind: "needs-choice",
      candidateIds: [],
    });
    expect(w.writes).toEqual([]);
    expect(w.reads.filter((r) => r.startsWith("searchSc"))).toEqual([
      "searchSc:Le Film",
    ]);
  });

  it("P2: once the owner wishes the rejected product, the SensCritique pass asks instead of mapping (G1)", async () => {
    const { w, ports } = yearless();
    await runSync(ports);
    w.state = noneOfThese(w.state, "naka", FILM);
    w.sc.add(FILM_SC);
    const r = await runSync(ports);
    expect(w.state.mapping).toEqual([]);
    expect(w.writes).toEqual([]);
    expect(w.state.pending).toEqual([
      asked("naka", FILM, []),
      asked("sc", FILM_SC, [FILM]),
    ]);
    expect(r.added).toEqual([]);
  });

  it("P2b: later runs keep both questions open and write nothing", async () => {
    const { w, ports } = yearless();
    await runSync(ports);
    w.state = noneOfThese(w.state, "naka", FILM);
    w.sc.add(FILM_SC);
    await runSync(ports);
    await runSync(ports);
    await runSync(ports);
    expect(w.writes).toEqual([]);
    expect(w.state.mapping).toEqual([]);
    expect(w.state.pending).toEqual([
      asked("naka", FILM, []),
      asked("sc", FILM_SC, [FILM]),
    ]);
  });

  it("step 5: a question whose only candidate another answer took stays open and stops the finish", async () => {
    const { w, ports } = world({
      naka: [FILM, 43],
      sc: [],
      nakaTitles: {
        [FILM]: { title: "Le Film", type: "film" },
        43: { title: "Le Film", type: "film" },
      },
      nakaCatalogue: {},
      scTitles: { [FILM_SC]: FILM_TITLE },
    });
    await runSync(ports);
    expect(w.state.pending).toEqual([
      asked("naka", FILM, [FILM_SC]),
      asked("naka", 43, [FILM_SC]),
    ]);
    w.state = answerByContract(w.state, { nakaId: 43, scId: FILM_SC });
    expect(w.state.pending).toEqual([asked("naka", FILM, [])]);
    expect(await handleFinish(film(), ports, DEFAULT_THRESHOLDS)).toEqual({
      kind: "needs-choice",
      candidateIds: [],
    });
    expect(w.writes).toEqual([]);
    expect(w.state.mapping).toEqual([{ nakaId: 43, scId: FILM_SC }]);
  });
});
