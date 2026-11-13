// Test-only fakes shared by the finish handler suites: one world that logs every port call in order.
import type { FinishEvent, FinishPorts } from "../src/core/finish-handler";
import type { Pair } from "../src/core/list-diff";
import { emptyState, type SyncState } from "../src/core/state";
import type { Candidate, Titled } from "../src/core/title-match";
import { UNIVERSE } from "../src/sc/sc-queries";
import type { ScEpisode } from "../src/sc/season-episodes";

export const TODAY = "2026-11-03";
export const FILM = 42;
export const FILM_SC = 1042;
export const SERIES = 7;
export const SERIES_SC = 1007;
export const SEASON1_SC = 4001;
export const FILM_PAIR: Pair = { nakaId: FILM, scId: FILM_SC };
export const SERIES_PAIR: Pair = { nakaId: SERIES, scId: SERIES_SC };

export const FILM_TITLE: Titled = {
  title: "Le Film",
  year: 2001,
  type: "film",
};
export const SERIES_TITLE: Titled = {
  title: "La Série",
  year: 2010,
  type: "serie",
};

export const cand = (id: number, titled: Titled): Candidate => ({
  id,
  ...titled,
});

export const ep = (
  season: number,
  episode: number,
  productId: number,
): ScEpisode => ({
  productId,
  season,
  episode,
  title: `Épisode ${episode}`,
  average: null,
});

export type Season = { seasonProductId?: number; episodes: ScEpisode[] };

export const SEASONS: Record<string, Season> = {
  [`${SERIES_SC}:1`]: {
    seasonProductId: SEASON1_SC,
    episodes: [1, 2, 3, 4, 5].map((e) => ep(1, e, 5000 + e)),
  },
  [`${SERIES_SC}:2`]: { episodes: [ep(2, 1, 6001)] },
};

// Episodes are 5000 and up, the two series products are 1007 and 2007, everything else is a film.
export const universeOf = (id: number): number => {
  if (id >= 5000) return UNIVERSE.episode;
  return id === SERIES_SC || id === 2007 ? UNIVERSE.serie : UNIVERSE.film;
};

export const SEARCH: Record<string, Candidate[]> = {
  [FILM_TITLE.title]: [cand(FILM_SC, FILM_TITLE)],
  [SERIES_TITLE.title]: [cand(SERIES_SC, SERIES_TITLE)],
};

export function film(over: Partial<FinishEvent> = {}): FinishEvent {
  return {
    source: "threshold",
    progress: 0.96,
    naka: { contentId: FILM, mediaType: "movie" },
    titled: FILM_TITLE,
    ...over,
  };
}

export function episode(
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

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export type Flags = {
  isDone: boolean;
  isWished: boolean;
  rating?: number | null;
};
export type Port =
  | "load"
  | "searchSc"
  | "productState"
  | "unwish"
  | "markDone"
  | "seasonInfo";
export type Opts = {
  state?: Partial<SyncState>;
  search?: Record<string, Candidate[]>;
  flags?: Record<number, Flags>;
  seasons?: Record<string, Season>;
  fail?: Port[];
  failSave?: number[];
  today?: string;
};

// One log for every port, in call order: the order of the steps is part of the contract.
export function world(o: Opts = {}) {
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
      const { isDone, isWished, rating } = o.flags?.[id] ?? {
        isDone: false,
        isWished: true,
      };
      return {
        isDone,
        isWished,
        rating: rating ?? null,
        average: null,
        universe: universeOf(id),
      };
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

export const writesOf = (calls: string[]): string[] =>
  calls.filter((c) => c.startsWith("unwish") || c.startsWith("markDone"));

export async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to reject with an Error");
}

export const asEvent = (value: unknown): FinishEvent => value as FinishEvent;
