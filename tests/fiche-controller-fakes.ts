// The ports of the title page controller tests: every worker call waits until the test answers it, so a
// test decides the order of the answers and sees which calls are in flight.

import type { FichePorts, TitlePageEvent } from "../src/content/fiche-ports";
import type { FicheView } from "../src/content/fiche-view";
import type { FicheInfo } from "../src/ext/fiche-answers";
import type { FicheMessage } from "../src/ext/fiche-messages";
import { PAGE_CHANNEL } from "../src/ext/messages";

export type Call = { msg: FicheMessage; answer(value: unknown): void };

export const FILM_PATH = "/content/movie/9005";
export const SERIES_PATH = "/content/tv/9006";

type FicheEventOf = Extract<TitlePageEvent, { kind: "fiche" }>;
type SeasonEventOf = Extract<TitlePageEvent, { kind: "season" }>;

export const ficheEvent = (over: Partial<FicheEventOf> = {}): FicheEventOf => ({
  channel: PAGE_CHANNEL,
  kind: "fiche",
  contentId: 5,
  tmdbId: 9005,
  mediaType: "movie",
  title: "Solaris",
  ...over,
});

export const seriesEvent = (over: Partial<FicheEventOf> = {}) =>
  ficheEvent({ contentId: 6, tmdbId: 9006, mediaType: "tv", ...over });

export const seasonEvent = (season: number, contentId = 6): SeasonEventOf => ({
  channel: PAGE_CHANNEL,
  kind: "season",
  contentId,
  season,
});

/** The product ids of the fiche-mine reads, in the order they were asked. */
export const minedIds = (calls: readonly Call[]) =>
  calls.flatMap((call) =>
    call.msg.type === "fiche-mine" ? [call.msg.productId] : [],
  );

export const linked = (id: number, mine: number | null = null): FicheInfo => ({
  state: "linked",
  product: { id, average: 6.9, mine, label: { title: "Solaris" } },
});

export const seasonOf = (...numbers: number[]) => ({
  episodes: numbers.map((episode) => ({
    episode,
    productId: 100 + episode,
    average: 7,
  })),
});

export function fakePorts() {
  const calls: Call[] = [];
  const views: (FicheView | undefined)[] = [];
  const page = {
    shown: undefined as number | undefined,
    visible: [] as number[],
    grid: true,
  };
  const ask = (msg: FicheMessage) =>
    new Promise<never>((resolve) => {
      calls.push({ msg, answer: resolve as (value: unknown) => void });
    });
  const ports: FichePorts = {
    info: ask,
    season: ask,
    mine: ask,
    rate: ask,
    link: ask,
    shownSeason: () => page.shown,
    hasEpisodeGrid: () => page.grid,
    visibleFirst: (numbers) => [
      ...numbers.filter((n) => page.visible.includes(n)),
      ...numbers.filter((n) => !page.visible.includes(n)),
    ],
    render: (view) => {
      views.push(view);
    },
  };
  const ofType = (type: FicheMessage["type"]) =>
    calls.filter((call) => call.msg.type === type);
  const last = () => views[views.length - 1];
  return { ports, calls, views, page, ofType, last };
}

/** Lets every resolved answer reach the controller. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
