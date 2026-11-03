import { describe, expect, it } from "vitest";
import {
  type FinishEvent,
  type FinishPorts,
  handleFinish,
} from "../src/core/finish-handler";
import type { Pair } from "../src/core/list-diff";
import { emptyState, type SyncState } from "../src/core/state";
import type { Candidate, Titled } from "../src/core/title-match";
import type { ScEpisode } from "../src/sc/season-episodes";

const TODAY = "2026-11-03";
const FILM = 42;
const FILM_SC = 1042;
const SERIES = 7;
const SERIES_SC = 1007;
const SEASON1_SC = 4001;
const FILM_PAIR: Pair = { nakaId: FILM, scId: FILM_SC };
const SERIES_PAIR: Pair = { nakaId: SERIES, scId: SERIES_SC };

const FILM_TITLE: Titled = { title: "Le Film", year: 2001, type: "film" };
const SERIES_TITLE: Titled = { title: "La Série", year: 2010, type: "serie" };

const cand = (id: number, titled: Titled): Candidate => ({ id, ...titled });

const ep = (season: number, episode: number, productId: number): ScEpisode => ({
  productId,
  season,
  episode,
  title: `Épisode ${episode}`,
});

type Season = { seasonProductId?: number; episodes: ScEpisode[] };

const SEASONS: Record<string, Season> = {
  [`${SERIES_SC}:1`]: {
    seasonProductId: SEASON1_SC,
    episodes: [1, 2, 3, 4, 5].map((e) => ep(1, e, 5000 + e)),
  },
  [`${SERIES_SC}:2`]: { episodes: [ep(2, 1, 6001)] },
};

const SEARCH: Record<string, Candidate[]> = {
  [FILM_TITLE.title]: [cand(FILM_SC, FILM_TITLE)],
  [SERIES_TITLE.title]: [cand(SERIES_SC, SERIES_TITLE)],
};

function film(over: Partial<FinishEvent> = {}): FinishEvent {
  return {
    source: "threshold",
    progress: 0.96,
    naka: { contentId: FILM, mediaType: "movie" },
    titled: FILM_TITLE,
    ...over,
  };
}

function episode(
  season: number,
  number: number,
  over: Partial<FinishEvent> = {},
): FinishEvent {
  return {
    source: "threshold",
    progress: 0.95,
    naka: { contentId: SERIES, mediaType: "tv", season, episode: number },
    titled: SERIES_TITLE,
    ...over,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

type Flags = { isDone: boolean; isWished: boolean };
type Port =
  | "load"
  | "searchSc"
  | "productState"
  | "unwish"
  | "markDone"
  | "seasonInfo";
type Opts = {
  state?: Partial<SyncState>;
  search?: Record<string, Candidate[]>;
  flags?: Record<number, Flags>;
  seasons?: Record<string, Season>;
  fail?: Port[];
  failSave?: number[];
  today?: string;
};

// One log for every port, in call order: the order of the steps is part of the contract.
function world(o: Opts = {}) {
  const w = {
    state: deepFreeze({ ...emptyState(), ...o.state }),
    calls: [] as string[],
    saved: [] as SyncState[],
    saves: 0,
    ports: undefined as unknown as FinishPorts,
  };
  const failing = (port: Port): void => {
    if (o.fail?.includes(port)) throw new Error(`${port} failed`);
  };
  w.ports = {
    load: async () => {
      w.calls.push("load");
      failing("load");
      return w.state;
    },
    save: async (state) => {
      w.saves += 1;
      w.calls.push("save");
      if (o.failSave?.includes(w.saves)) throw new Error("save failed");
      w.saved.push(state);
      w.state = deepFreeze(state);
    },
    searchSc: async (q) => {
      w.calls.push(`searchSc:${q}`);
      failing("searchSc");
      return o.search?.[q] ?? SEARCH[q] ?? [];
    },
    productState: async (id) => {
      w.calls.push(`productState:${id}`);
      failing("productState");
      return o.flags?.[id] ?? { isDone: false, isWished: true };
    },
    unwish: async (id) => {
      w.calls.push(`unwish:${id}`);
      failing("unwish");
    },
    markDone: async (id, date) => {
      w.calls.push(`markDone:${id}:${date}`);
      failing("markDone");
    },
    seasonInfo: async (id, season) => {
      w.calls.push(`seasonInfo:${id}:${season}`);
      failing("seasonInfo");
      return (o.seasons ?? SEASONS)[`${id}:${season}`] ?? { episodes: [] };
    },
    today: () => {
      w.calls.push("today");
      return o.today ?? TODAY;
    },
  };
  return w;
}

const writesOf = (calls: string[]): string[] =>
  calls.filter((c) => c.startsWith("unwish") || c.startsWith("markDone"));

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to reject with an Error");
}

const asEvent = (value: unknown): FinishEvent => value as FinishEvent;

describe("the event is checked before any port call", () => {
  const MALFORMED = "finish event: malformed event";
  const SOURCE = "finish event: unknown source";
  const CONTENT_ID = "finish event: contentId must be a positive safe integer";
  const PROGRESS = "finish event: progress must be a finite number >= 0";
  const TITLE = "finish event: title must not be empty";
  const MEDIA = "finish event: unknown media type";
  const MOVIE_TYPE = "finish event: a movie needs a film title";
  const MOVIE_PARTS = "finish event: a movie has no season or episode";
  const TV_TYPE = "finish event: an episode needs a series title";
  const TV_PARTS =
    "finish event: season and episode must be positive safe integers";
  const MOVIE = { contentId: FILM, mediaType: "movie" } as const;
  const titled = (title: unknown) =>
    asEvent({ ...film(), titled: { ...FILM_TITLE, title } });
  const tvWithout = (key: "season" | "episode") => {
    const naka: Record<string, unknown> = { ...episode(1, 2).naka };
    delete naka[key];
    return asEvent({ ...episode(1, 2), naka });
  };

  const BAD: [string, FinishEvent, string][] = [
    ["a null event", asEvent(null), MALFORMED],
    [
      "an event without naka",
      asEvent({ ...film(), naka: undefined }),
      MALFORMED,
    ],
    [
      "an event without titled",
      asEvent({ ...film(), titled: null }),
      MALFORMED,
    ],
    ["an unknown source", asEvent({ ...film(), source: "auto" }), SOURCE],
    ["contentId 0", film({ naka: { ...MOVIE, contentId: 0 } }), CONTENT_ID],
    ["contentId -1", film({ naka: { ...MOVIE, contentId: -1 } }), CONTENT_ID],
    ["contentId 1.5", film({ naka: { ...MOVIE, contentId: 1.5 } }), CONTENT_ID],
    [
      "contentId NaN",
      film({ naka: { ...MOVIE, contentId: Number.NaN } }),
      CONTENT_ID,
    ],
    [
      "contentId 2 ** 53",
      film({ naka: { ...MOVIE, contentId: 2 ** 53 } }),
      CONTENT_ID,
    ],
    [
      "contentId as a string",
      asEvent({ ...film(), naka: { ...MOVIE, contentId: "42" } }),
      CONTENT_ID,
    ],
    [
      "an episode with contentId 0",
      episode(1, 2, {
        naka: { contentId: 0, mediaType: "tv", season: 1, episode: 2 },
      }),
      CONTENT_ID,
    ],
    ["progress NaN", film({ progress: Number.NaN }), PROGRESS],
    ["progress -0.01", film({ progress: -0.01 }), PROGRESS],
    [
      "progress Infinity",
      film({ progress: Number.POSITIVE_INFINITY }),
      PROGRESS,
    ],
    [
      "progress as a string",
      asEvent({ ...film(), progress: "0.95" }),
      PROGRESS,
    ],
    ["an empty title", titled(""), TITLE],
    ["a blank title", titled(" \t\n "), TITLE],
    ["a title that is not a string", titled(42), TITLE],
    [
      "an unknown media type",
      asEvent({ ...film(), naka: { contentId: FILM, mediaType: "music" } }),
      MEDIA,
    ],
    ["a movie with a series title", film({ titled: SERIES_TITLE }), MOVIE_TYPE],
    [
      "a movie with a season",
      film({ naka: { ...MOVIE, season: 1 } }),
      MOVIE_PARTS,
    ],
    [
      "a movie with an episode",
      film({ naka: { ...MOVIE, episode: 1 } }),
      MOVIE_PARTS,
    ],
    [
      "an episode with a film title",
      episode(1, 2, { titled: FILM_TITLE }),
      TV_TYPE,
    ],
    ["an episode without a season", tvWithout("season"), TV_PARTS],
    ["an episode without an episode number", tvWithout("episode"), TV_PARTS],
    ["season 0", episode(0, 2), TV_PARTS],
    ["season 1.5", episode(1.5, 2), TV_PARTS],
    ["season NaN", episode(Number.NaN, 2), TV_PARTS],
    ["episode 0", episode(1, 0), TV_PARTS],
    ["episode -2", episode(1, -2), TV_PARTS],
    ["episode 2 ** 53", episode(1, 2 ** 53), TV_PARTS],
  ];

  it.each(BAD)(
    "rejects %s with a RangeError and calls no port",
    async (_name, event, message) => {
      const w = world();
      const error = await failure(handleFinish(event, w.ports));
      expect(error).toBeInstanceOf(RangeError);
      expect(error.message).toBe(message);
      expect(w.calls).toEqual([]);
    },
  );

  it("checks the id before the progress", async () => {
    const w = world();
    const event = film({
      progress: Number.NaN,
      naka: { ...MOVIE, contentId: 0 },
    });
    expect((await failure(handleFinish(event, w.ports))).message).toBe(
      CONTENT_ID,
    );
  });

  it.each([
    ["contentId 1", film({ naka: { ...MOVIE, contentId: 1 } })],
    [
      "the largest safe contentId",
      film({ naka: { ...MOVIE, contentId: Number.MAX_SAFE_INTEGER } }),
    ],
    [
      "progress 0 on an explicit event",
      film({ source: "explicit", progress: 0 }),
    ],
    ["progress 1.5", film({ progress: 1.5 })],
    [
      "a title with spaces around it",
      film({ titled: { ...FILM_TITLE, title: " Le Film " } }),
    ],
  ])("accepts %s", async (_name, event) => {
    const w = world({ search: { " Le Film ": [cand(FILM_SC, FILM_TITLE)] } });
    expect(await handleFinish(event, w.ports)).toEqual({
      kind: "done",
      ratingTargets: [{ label: "film", productId: FILM_SC }],
    });
  });

  it("accepts season 1 episode 1", async () => {
    const w = world();
    const outcome = await handleFinish(episode(1, 1), w.ports);
    expect(outcome.kind).toBe("done");
    expect(w.calls).toContain("markDone:5001:2026-11-03");
  });
});

describe("order of the run: load, threshold, handled", () => {
  it("a load that fails rejects with no other call", async () => {
    const w = world({ fail: ["load"] });
    expect((await failure(handleFinish(film(), w.ports))).message).toBe(
      "load failed",
    );
    expect(w.calls).toEqual(["load"]);
  });

  it.each([
    ["threshold", 0],
    ["threshold", -0.5],
    ["threshold", 1.01],
    ["threshold", Number.NaN],
    ["explicit", 0],
    ["explicit", Number.NaN],
  ] as const)(
    "a %s event with a stored threshold of %s rejects after the load only",
    async (source, threshold) => {
      const w = world({ state: { threshold } });
      const error = await failure(handleFinish(film({ source }), w.ports));
      expect(error).toBeInstanceOf(RangeError);
      expect(error.message).toContain("threshold must be in (0, 1]");
      expect(w.calls).toEqual(["load"]);
    },
  );

  it("a bad stored threshold rejects even for a handled title", async () => {
    const w = world({ state: { threshold: 0, handled: ["movie:42"] } });
    expect(await failure(handleFinish(film(), w.ports))).toBeInstanceOf(
      RangeError,
    );
  });

  it("a low progress on a handled title reports below-threshold", async () => {
    const w = world({ state: { handled: ["movie:42"] } });
    expect(await handleFinish(film({ progress: 0.5 }), w.ports)).toEqual({
      kind: "ignored",
      reason: "below-threshold",
    });
    expect(w.calls).toEqual(["load"]);
  });

  it.each(["threshold", "explicit"] as const)(
    "a complete %s event on a handled film is ignored after the load only",
    async (source) => {
      const w = world({ state: { handled: ["movie:42"] } });
      expect(await handleFinish(film({ source }), w.ports)).toEqual({
        kind: "ignored",
        reason: "already-handled",
      });
      expect(w.calls).toEqual(["load"]);
    },
  );
});

describe("threshold", () => {
  it("a threshold event at 0.01 is ignored after the load only (anti-goal)", async () => {
    const w = world();
    expect(await handleFinish(film({ progress: 0.01 }), w.ports)).toEqual({
      kind: "ignored",
      reason: "below-threshold",
    });
    expect(w.calls).toEqual(["load"]);
  });

  it("an explicit event at 0.01 completes", async () => {
    const w = world();
    const outcome = await handleFinish(
      film({ source: "explicit", progress: 0.01 }),
      w.ports,
    );
    expect(outcome.kind).toBe("done");
    expect(writesOf(w.calls)).toEqual([
      "unwish:1042",
      "markDone:1042:2026-11-03",
    ]);
  });

  it.each([
    [film(), "markDone:1042:2027-01-31"],
    [episode(1, 2), "markDone:5002:2027-01-31"],
  ])("marks done on the date today() gives", async (event, write) => {
    const w = world({ today: "2027-01-31" });
    await handleFinish(event, w.ports);
    expect(writesOf(w.calls).slice(-1)).toEqual([write]);
  });

  it.each([
    [0.9, 0.9, "done"],
    [0.9, 0.8999, "ignored"],
    [0.5, 0.6, "done"],
    [0.97, 0.96, "ignored"],
    [1, 1, "done"],
  ])(
    "with a stored threshold of %s, a progress of %s is %s",
    async (threshold, progress, kind) => {
      const w = world({ state: { threshold } });
      const outcome = await handleFinish(film({ progress }), w.ports);
      expect(outcome.kind).toBe(kind);
    },
  );
});

describe("content keys", () => {
  it.each([
    [["movie:42"], "ignored"],
    [["movie:43"], "done"],
    [["movie:4"], "done"],
    [["tv:42:S1E1"], "done"],
  ])("handled %j: film 42 is %s", async (handled, kind) => {
    const w = world({ state: { handled } });
    expect((await handleFinish(film(), w.ports)).kind).toBe(kind);
  });

  it.each([
    [["tv:7:S1E2"], 1, 2, "ignored"],
    [["tv:7:S1E2"], 1, 3, "done"],
    [["tv:7:S1E2"], 2, 1, "done"],
    [["tv:7:S2E1"], 1, 2, "done"],
    [["movie:7"], 1, 2, "done"],
    [["tv:7:S1E1"], 1, 1, "ignored"],
  ])(
    "handled %j: S%sE%s of series 7 is %s",
    async (handled, season, number, kind) => {
      const w = world({ state: { handled } });
      expect((await handleFinish(episode(season, number), w.ports)).kind).toBe(
        kind,
      );
    },
  );

  it("records movie:<id> after a film", async () => {
    const w = world({ state: { handled: ["other"] } });
    await handleFinish(film(), w.ports);
    expect(w.state.handled).toEqual(["other", "movie:42"]);
  });

  it("records tv:<id>:S<s>E<e> after an episode", async () => {
    const w = world();
    await handleFinish(episode(2, 1), w.ports);
    expect(w.state.handled).toEqual(["tv:7:S2E1"]);
  });
});

describe("film", () => {
  it("reads the state, saves the settled pair, then unwishes and marks it done", async () => {
    const w = world();
    expect(await handleFinish(film(), w.ports)).toEqual({
      kind: "done",
      ratingTargets: [{ label: "film", productId: FILM_SC }],
    });
    expect(w.calls).toEqual([
      "load",
      "searchSc:Le Film",
      "productState:1042",
      "save",
      "unwish:1042",
      "today",
      "markDone:1042:2026-11-03",
      "save",
    ]);
    const state1 = {
      ...emptyState(),
      mapping: [FILM_PAIR],
      settled: [FILM_PAIR],
    };
    expect(w.saved).toStrictEqual([
      state1,
      { ...state1, handled: ["movie:42"] },
    ]);
  });

  it("a second event for the same film writes nothing: the date is not rewritten", async () => {
    const w = world();
    await handleFinish(film(), w.ports);
    const before = w.calls.length;
    expect(await handleFinish(film({ source: "explicit" }), w.ports)).toEqual({
      kind: "ignored",
      reason: "already-handled",
    });
    expect(w.calls.slice(before)).toEqual(["load"]);
    expect(writesOf(w.calls)).toEqual([
      "unwish:1042",
      "markDone:1042:2026-11-03",
    ]);
  });

  it.each([
    [false, true, ["unwish:1042", "markDone:1042:2026-11-03"], true],
    [false, false, ["markDone:1042:2026-11-03"], true],
    [true, true, ["unwish:1042"], false],
    [true, false, [], false],
  ])(
    "isDone %s, isWished %s: writes %j",
    async (isDone, isWished, writes, rated) => {
      const w = world({ flags: { [FILM_SC]: { isDone, isWished } } });
      expect(await handleFinish(film(), w.ports)).toEqual({
        kind: "done",
        ratingTargets: rated ? [{ label: "film", productId: FILM_SC }] : [],
      });
      expect(writesOf(w.calls)).toEqual(writes);
      expect(w.calls.includes("today")).toBe(!isDone);
      expect(w.state.handled).toEqual(["movie:42"]);
      expect(w.state.settled).toEqual([FILM_PAIR]);
    },
  );

  it("a mapped film is not searched and its mapping is kept as is", async () => {
    const w = world({ state: { mapping: [FILM_PAIR, SERIES_PAIR] } });
    await handleFinish(film(), w.ports);
    expect(w.calls.some((c) => c.startsWith("searchSc"))).toBe(false);
    expect(w.saved[0]?.mapping).toEqual([FILM_PAIR, SERIES_PAIR]);
    expect(w.saved[0]?.settled).toEqual([FILM_PAIR]);
  });

  it("an already settled pair is not settled twice", async () => {
    const w = world({ state: { mapping: [FILM_PAIR], settled: [FILM_PAIR] } });
    await handleFinish(film(), w.ports);
    expect(w.state.settled).toEqual([FILM_PAIR]);
  });

  it("a rejected productState rejects with no save and no write", async () => {
    const w = world({ fail: ["productState"] });
    expect((await failure(handleFinish(film(), w.ports))).message).toBe(
      "productState failed",
    );
    expect(w.calls).toEqual(["load", "searchSc:Le Film", "productState:1042"]);
    expect(w.saved).toEqual([]);
  });

  it("a rejected first save rejects with no write", async () => {
    const w = world({ failSave: [1] });
    expect((await failure(handleFinish(film(), w.ports))).message).toBe(
      "save failed",
    );
    expect(writesOf(w.calls)).toEqual([]);
    expect(w.saved).toEqual([]);
  });

  const state1 = {
    ...emptyState(),
    mapping: [FILM_PAIR],
    settled: [FILM_PAIR],
  };

  it.each([
    ["unwish", { fail: ["unwish"] as Port[] }, ["unwish:1042"]],
    [
      "markDone",
      { fail: ["markDone"] as Port[] },
      ["unwish:1042", "markDone:1042:2026-11-03"],
    ],
    [
      "the second save",
      { failSave: [2] },
      ["unwish:1042", "markDone:1042:2026-11-03"],
    ],
  ])(
    "when %s rejects, the handler rejects and leaves the pair mapped and settled, not handled",
    async (_name, opts, writes) => {
      const w = world(opts);
      await failure(handleFinish(film(), w.ports));
      expect(writesOf(w.calls)).toEqual(writes);
      expect(w.saved).toStrictEqual([state1]);
      expect(w.state).toStrictEqual(state1);
    },
  );
});

describe("matching on SensCritique", () => {
  const BILINGUAL: Titled = {
    title: "Le Titre",
    originalTitle: "The Title",
    year: 2001,
    type: "film",
  };
  const bilingual = film({ titled: BILINGUAL });
  const searches = (calls: string[]) =>
    calls.filter((c) => c.startsWith("searchSc"));

  it("a mapped series is not searched", async () => {
    const w = world({ state: { mapping: [SERIES_PAIR] } });
    await handleFinish(episode(1, 2), w.ports);
    expect(searches(w.calls)).toEqual([]);
    expect(w.calls).toContain("seasonInfo:1007:1");
  });

  it("searches the original title when the title finds no candidate", async () => {
    const w = world({
      search: {
        "Le Titre": [],
        "The Title": [cand(FILM_SC, { ...BILINGUAL, title: "The Title" })],
      },
    });
    expect((await handleFinish(bilingual, w.ports)).kind).toBe("done");
    expect(searches(w.calls)).toEqual([
      "searchSc:Le Titre",
      "searchSc:The Title",
    ]);
  });

  it("does not search the original title when the title found a candidate", async () => {
    const w = world({
      search: {
        "Le Titre": [cand(FILM_SC, BILINGUAL)],
        "The Title": [cand(9999, BILINGUAL)],
      },
    });
    expect((await handleFinish(bilingual, w.ports)).kind).toBe("done");
    expect(searches(w.calls)).toEqual(["searchSc:Le Titre"]);
    expect(w.calls).toContain("productState:1042");
  });

  it("does not search the original title when the title's candidates do not match", async () => {
    const w = world({
      search: {
        "Le Titre": [cand(3000, { title: "Autre", year: 2001, type: "film" })],
        "The Title": [cand(FILM_SC, BILINGUAL)],
      },
    });
    expect(await handleFinish(bilingual, w.ports)).toEqual({
      kind: "not-found",
    });
    expect(searches(w.calls)).toEqual(["searchSc:Le Titre"]);
  });

  it("searches once when there is no original title", async () => {
    const w = world({ search: { "Le Film": [] } });
    expect(await handleFinish(film(), w.ports)).toEqual({ kind: "not-found" });
    expect(w.calls).toEqual(["load", "searchSc:Le Film"]);
    expect(w.saved).toEqual([]);
  });

  it("a candidate listed twice is one candidate", async () => {
    const c = cand(FILM_SC, FILM_TITLE);
    const w = world({ search: { "Le Film": [c, c] } });
    expect((await handleFinish(film(), w.ports)).kind).toBe("done");
  });

  it("an ambiguous film asks the owner, saves the question and writes nothing", async () => {
    const w = world({
      search: {
        "Le Film": [cand(FILM_SC, FILM_TITLE), cand(2042, FILM_TITLE)],
      },
    });
    expect(await handleFinish(film(), w.ports)).toEqual({
      kind: "needs-choice",
      candidateIds: [FILM_SC, 2042],
    });
    expect(w.calls).toEqual(["load", "searchSc:Le Film", "save"]);
    expect(w.saved).toStrictEqual([
      {
        ...emptyState(),
        pending: [
          {
            kind: "ambiguity",
            side: "naka",
            id: FILM,
            candidateIds: [FILM_SC, 2042],
          },
        ],
      },
    ]);
  });

  it("an ambiguous series asks the owner before any season read", async () => {
    const w = world({
      search: {
        "La Série": [cand(SERIES_SC, SERIES_TITLE), cand(2007, SERIES_TITLE)],
      },
    });
    expect(await handleFinish(episode(1, 2), w.ports)).toEqual({
      kind: "needs-choice",
      candidateIds: [SERIES_SC, 2007],
    });
    expect(w.calls).toEqual(["load", "searchSc:La Série", "save"]);
    expect(w.state.pending).toEqual([
      {
        kind: "ambiguity",
        side: "naka",
        id: SERIES,
        candidateIds: [SERIES_SC, 2007],
      },
    ]);
  });

  it("a rejected save of the question rejects", async () => {
    const w = world({
      failSave: [1],
      search: {
        "Le Film": [cand(FILM_SC, FILM_TITLE), cand(2042, FILM_TITLE)],
      },
    });
    expect((await failure(handleFinish(film(), w.ports))).message).toBe(
      "save failed",
    );
  });

  it("no candidate: not-found, nothing saved", async () => {
    const w = world({ search: { "Le Film": [] } });
    expect(await handleFinish(film(), w.ports)).toEqual({ kind: "not-found" });
    expect(w.saved).toEqual([]);
  });

  it.each([
    ["film", film(), FILM, FILM_SC],
    ["series", episode(1, 2), SERIES, SERIES_SC],
  ] as const)(
    "a %s matching an id mapped to another Naka title asks the owner (swap guard)",
    async (_name, event, nakaId, scId) => {
      const other = { nakaId: 99, scId };
      const w = world({ state: { mapping: [other] } });
      expect(await handleFinish(event, w.ports)).toEqual({
        kind: "needs-choice",
        candidateIds: [scId],
      });
      expect(w.calls.slice(-1)).toEqual(["save"]);
      expect(w.calls.filter((c) => c === "save")).toHaveLength(1);
      expect(w.state.mapping).toEqual([other]);
      expect(w.state.pending).toEqual([
        { kind: "ambiguity", side: "naka", id: nakaId, candidateIds: [scId] },
      ]);
    },
  );

  it("a film never matches a series with the same title", async () => {
    const w = world({
      search: { "Le Film": [cand(FILM_SC, { ...FILM_TITLE, type: "serie" })] },
    });
    expect(await handleFinish(film(), w.ports)).toEqual({ kind: "not-found" });
  });

  it("a series never matches a film with the same title", async () => {
    const w = world({
      search: {
        "La Série": [cand(SERIES_SC, { ...SERIES_TITLE, type: "film" })],
      },
    });
    expect(await handleFinish(episode(1, 2), w.ports)).toEqual({
      kind: "not-found",
    });
    expect(w.calls.some((c) => c.startsWith("seasonInfo"))).toBe(false);
  });

  it("picks the film among a series and a film with the same title", async () => {
    const w = world({
      search: {
        "Le Film": [
          cand(3000, { ...FILM_TITLE, type: "serie" }),
          cand(FILM_SC, FILM_TITLE),
        ],
      },
    });
    expect((await handleFinish(film(), w.ports)).kind).toBe("done");
    expect(w.calls).toContain("productState:1042");
  });
});

describe("episode", () => {
  it("marks the episode done, never unwishes, saves once with the new mapping", async () => {
    const w = world();
    expect(await handleFinish(episode(1, 2), w.ports)).toEqual({
      kind: "done",
      ratingTargets: [
        { label: "épisode", productId: 5002 },
        { label: "saison", productId: SEASON1_SC },
        { label: "série", productId: SERIES_SC },
      ],
    });
    expect(w.calls).toEqual([
      "load",
      "searchSc:La Série",
      "seasonInfo:1007:1",
      "productState:5002",
      "today",
      "markDone:5002:2026-11-03",
      "save",
    ]);
    expect(w.saved).toStrictEqual([
      { ...emptyState(), mapping: [SERIES_PAIR], handled: ["tv:7:S1E2"] },
    ]);
  });

  it("without a season product, the targets are the episode and the series", async () => {
    const w = world();
    expect(await handleFinish(episode(2, 1), w.ports)).toEqual({
      kind: "done",
      ratingTargets: [
        { label: "épisode", productId: 6001 },
        { label: "série", productId: SERIES_SC },
      ],
    });
    expect(w.calls).toContain("seasonInfo:1007:2");
  });

  it("finds the episode by its number, not by its position", async () => {
    const seasons = {
      [`${SERIES_SC}:1`]: {
        seasonProductId: SEASON1_SC,
        episodes: [ep(1, 3, 5003), ep(1, 1, 5001), ep(1, 2, 5002)],
      },
    };
    const w = world({ seasons });
    await handleFinish(episode(1, 2), w.ports);
    expect(writesOf(w.calls)).toEqual(["markDone:5002:2026-11-03"]);
  });

  it("an unknown episode is not found: no read of its state, no write, nothing saved", async () => {
    const w = world();
    expect(await handleFinish(episode(1, 9), w.ports)).toEqual({
      kind: "not-found",
    });
    expect(w.calls).toEqual(["load", "searchSc:La Série", "seasonInfo:1007:1"]);
    expect(w.saved).toEqual([]);
  });

  it("an episode already done is not rewritten and prompts nothing", async () => {
    const w = world({ flags: { 5002: { isDone: true, isWished: true } } });
    expect(await handleFinish(episode(1, 2), w.ports)).toEqual({
      kind: "done",
      ratingTargets: [],
    });
    expect(writesOf(w.calls)).toEqual([]);
    expect(w.calls).not.toContain("today");
    expect(w.state.handled).toEqual(["tv:7:S1E2"]);
  });

  it("five episodes of one series: zero unwish and the series pair is never settled", async () => {
    const w = world({
      state: { mapping: [SERIES_PAIR], snapshot: [SERIES_PAIR] },
    });
    for (const number of [1, 2, 3, 4, 5]) {
      expect((await handleFinish(episode(1, number), w.ports)).kind).toBe(
        "done",
      );
    }
    expect(w.calls.filter((c) => c.startsWith("unwish"))).toEqual([]);
    expect(writesOf(w.calls)).toEqual(
      [5001, 5002, 5003, 5004, 5005].map((id) => `markDone:${id}:${TODAY}`),
    );
    expect(w.state).toStrictEqual({
      ...emptyState(),
      mapping: [SERIES_PAIR],
      snapshot: [SERIES_PAIR],
      settled: [],
      handled: [
        "tv:7:S1E1",
        "tv:7:S1E2",
        "tv:7:S1E3",
        "tv:7:S1E4",
        "tv:7:S1E5",
      ],
    });
  });

  it.each([
    ["seasonInfo", { fail: ["seasonInfo"] as Port[] }, []],
    ["productState", { fail: ["productState"] as Port[] }, []],
    [
      "markDone",
      { fail: ["markDone"] as Port[] },
      ["markDone:5002:2026-11-03"],
    ],
  ])("a rejected %s rejects with nothing saved", async (name, opts, writes) => {
    const w = world(opts);
    expect((await failure(handleFinish(episode(1, 2), w.ports))).message).toBe(
      `${name} failed`,
    );
    expect(writesOf(w.calls)).toEqual(writes);
    expect(w.calls).not.toContain("save");
    expect(w.saved).toEqual([]);
  });

  it("a rejected save rejects after the write", async () => {
    const w = world({ failSave: [1] });
    await failure(handleFinish(episode(1, 2), w.ports));
    expect(w.calls.slice(-2)).toEqual(["markDone:5002:2026-11-03", "save"]);
    expect(w.saved).toEqual([]);
  });
});

describe("the loaded state is never mutated", () => {
  it.each([
    ["a film found by search", film(), {}],
    ["a mapped film", film(), { mapping: [FILM_PAIR] }],
    ["an episode", episode(1, 2), {}],
    ["an ambiguous film", film(), { mapping: [{ nakaId: 99, scId: FILM_SC }] }],
  ])("%s", async (_name, event, state) => {
    const w = world({ state });
    const loaded = w.state;
    const copy = structuredClone(loaded);
    await handleFinish(event, w.ports);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(loaded).toStrictEqual(copy);
  });
});
