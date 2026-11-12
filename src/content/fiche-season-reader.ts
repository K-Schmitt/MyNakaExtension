// The season the page shows: read once the title has its product, among the seasons the page fetched
// (it prefetches others) the one its dropdown names. Its averages show at once; then the owner's own
// ratings, one read at a time, visible boxes first. Opening another season, or leaving, stops the reads.

import type { SeasonAnswer } from "../ext/fiche-answers";
import {
  contentOf,
  type Episodes,
  type FichePage,
  type FicheScope,
  storeEpisodes,
  withMine,
} from "./fiche-page";

const MAX_SEEN = 100;

const seenKey = (contentId: number, season: number) => `${contentId}:${season}`;

export function noteSeason(
  page: FichePage,
  contentId: number,
  season: number,
): void {
  if (page.seen.size < MAX_SEEN) page.seen.add(seenKey(contentId, season));
}

function seasonToOpen(scope: FicheScope): number | undefined {
  const { page, ports } = scope;
  const contentId = contentOf(page);
  if (page.title.mediaType !== "tv" || contentId === undefined) return;
  if (page.info?.product === undefined) return;
  const shown = ports.shownSeason();
  if (shown === undefined || shown === page.season) return;
  return page.seen.has(seenKey(contentId, shown)) ? shown : undefined;
}

export function considerSeason(scope: FicheScope): void {
  const season = seasonToOpen(scope);
  if (season !== undefined) openSeason(scope, season);
}

function openSeason(scope: FicheScope, season: number): void {
  const { page } = scope;
  const turn = {};
  page.turn = turn;
  page.season = season;
  page.episodes = page.read.get(season) ?? new Map();
  scope.reads.cancel();
  scope.show();
  const live = () => scope.live() && page.turn === turn;
  if (page.read.has(season)) readMine(scope, season, live);
  else void fetchSeason(scope, season, live);
}

function episodesOf(answer: SeasonAnswer): Episodes {
  return new Map(
    answer.episodes.map(({ episode, productId, average }) => [
      episode,
      { productId, average },
    ]),
  );
}

async function fetchSeason(
  scope: FicheScope,
  season: number,
  live: () => boolean,
): Promise<void> {
  const contentId = contentOf(scope.page);
  if (contentId === undefined) return;
  const answer = await scope.ports.season({
    type: "fiche-season",
    contentId,
    season,
  });
  if (!live() || answer === undefined) return;
  storeEpisodes(scope.page, season, episodesOf(answer));
  scope.show();
  readMine(scope, season, live);
}

function readMine(
  scope: FicheScope,
  season: number,
  live: () => boolean,
): void {
  const tried = new Set<number>();
  scope.reads.run(() => {
    if (!live()) return undefined;
    const episode = nextUnread(scope, tried);
    if (episode === undefined) return undefined;
    tried.add(episode);
    return (queueLive) =>
      readOne(scope, season, episode, () => live() && queueLive());
  });
}

function nextUnread(
  scope: FicheScope,
  tried: ReadonlySet<number>,
): number | undefined {
  const unread = [...scope.page.episodes]
    .filter(([n, known]) => known.mine === undefined && !tried.has(n))
    .map(([n]) => n);
  return scope.ports.visibleFirst(unread).find((n) => unread.includes(n));
}

async function readOne(
  scope: FicheScope,
  season: number,
  episode: number,
  live: () => boolean,
): Promise<void> {
  const { page } = scope;
  const known = page.episodes.get(episode);
  const contentId = contentOf(page);
  if (known === undefined || contentId === undefined) return;
  const answer = await scope.ports.mine({
    type: "fiche-mine",
    contentId,
    productId: known.productId,
  });
  if (!live() || answer === undefined) return;
  const episodes = page.read.get(season);
  // A rating the owner sent meanwhile is newer than this read.
  if (episodes === undefined || episodes.get(episode)?.mine !== undefined) {
    return;
  }
  storeEpisodes(page, season, withMine(episodes, episode, answer.mine));
  scope.show();
}

/** The visit's seasons forgotten (a new info resets what the worker issued to the tab). */
export function forgetSeasons(scope: FicheScope): void {
  const { page } = scope;
  page.turn = undefined;
  page.season = undefined;
  page.episodes = new Map();
  page.read.clear();
  scope.reads.cancel();
}
