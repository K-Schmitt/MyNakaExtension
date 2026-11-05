// The world of the answer jobs' tests: the REAL jobs over a memory store, a Naka tab running the REAL tab
// handler over a fake Naka client, and a fake SensCritique client. Every port call is logged.
import type { Pair } from "../src/core/list-diff";
import type { RatingCard } from "../src/core/rating-cards";
import { emptyState, type SyncState } from "../src/core/state";
import { parseSettings, type Settings } from "../src/ext/settings";
import type { NakaClient, NakaItem } from "../src/naka/naka-client";
import type { ProductState, ScClient } from "../src/sc/sc-client";
import { createJobs } from "../src/sw/jobs";
import type { TabsPort } from "../src/sw/naka-proxy";
import { type Traffic, tabRunning } from "./naka-bridge-fakes";
import { countingLimiter, fakeNaka, fakeSc, memoryStore } from "./sw-fakes";

export const NOW = Date.parse("2026-11-05T12:00:00Z");
export const BOUND = { scUsername: "owner", nakaAccount: "77" };

/** The removal fixtures' pair: Naka 21, SensCritique 1021. */
export const PAIR: Pair = { nakaId: 21, scId: 1021 };

export type WorldOpts = {
  state?: SyncState;
  settings?: Settings;
  /** « Ma liste » as Naka reads it now. Default: [99], a list without 21. */
  playlist?: () => number[];
  /** What SensCritique says of each product. Default: a wished film. */
  product?: (id: number) => Partial<ProductState>;
  naka?: Partial<NakaClient>;
  sc?: Partial<ScClient>;
  nakaAccount?: () => string | undefined;
  username?: string;
  tabs?: (real: TabsPort) => TabsPort;
};

const movie = (id: number): NakaItem => ({
  contentId: id,
  tmdbId: 9000 + id,
  mediaType: "movie",
  title: `Titre ${id}`,
  releaseDate: "2005-01-01",
});

export function answerWorld(o: WorldOpts = {}) {
  const { area, store } = memoryStore();
  area.data.set("state", structuredClone(o.state ?? emptyState()));
  if (o.settings) area.data.set("settings", structuredClone(o.settings));
  const nk = fakeNaka({
    playlistIds: async () => (o.playlist ?? (() => [99]))(),
    contentById: async (id) => movie(id),
    ...o.naka,
  });
  const sk = fakeSc({
    productState: async (id) => ({
      isDone: false,
      isWished: true,
      universe: 1,
      rating: null,
      ...o.product?.(id),
    }),
    ...o.sc,
  });
  const traffic: Traffic = { sent: [], returned: [] };
  const limited: string[] = [];
  const real = tabRunning(
    nk.client,
    o.nakaAccount ?? (() => "77"),
    traffic,
  ).tabs;
  const jobs = createJobs({
    store,
    tabs: o.tabs ? o.tabs(real) : real,
    sc: sk.client,
    scUsername: async () => o.username ?? "owner",
    limiters: {
      naka: countingLimiter(limited, "naka"),
      sc: countingLimiter(limited, "sc"),
    },
    now: () => NOW,
    today: () => "2026-11-05",
    timer: { set: () => 0, clear: () => undefined },
  });
  return {
    jobs,
    area,
    nk,
    sk,
    traffic,
    /** The slots taken on the shared limiters, in order: "limit:naka" | "limit:sc". */
    limited,
    state: () => area.data.get("state") as SyncState,
    /** Parsed by the REAL parser: a record that breaks the settings fails here. */
    settings: () => parseSettings(area.data.get("settings")),
    cards: () => (area.data.get("ratings") as RatingCard[] | undefined) ?? [],
    stateSaves: () => area.sets.filter((s) => "state" in s).length,
    /** Every write either site saw. */
    writes: () => [
      ...sk.calls.filter((c) =>
        /^(wish|unwish|markDone|unmarkDone|rate):/.test(c),
      ),
      ...nk.calls.filter((c) => /^(addToPlaylist|removeFromPlaylist):/.test(c)),
    ],
    /** Every call to either site, the Naka account read included. */
    network: () => [...sk.calls, ...nk.calls, ...traffic.sent],
  };
}

export type AnswerWorld = ReturnType<typeof answerWorld>;
