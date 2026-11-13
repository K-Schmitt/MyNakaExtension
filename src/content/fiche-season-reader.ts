// The season the page shows: read once the title has its product, the one its dropdown names (with no
// dropdown, the lone season the page fetched), and only a season the title can have: one it cannot have
// closes the shown season. Its averages show at once; then the owner's own ratings (fiche-own-ratings).
// Opening another season, closing it, or leaving, stops the reads.

import type { SeasonAnswer } from "../ext/fiche-answers";
import { MAX_SEASON_COUNT } from "../ext/fiche-page-events";
import { readMine } from "./fiche-own-ratings";
import {
  contentOf,
  type Episodes,
  type FichePage,
  type FicheScope,
  storeEpisodes,
} from "./fiche-page";
import { noteSeen, seasonsOf } from "./fiche-seen-seasons";

export function noteSeason(
  page: FichePage,
  contentId: number,
  season: number,
): void {
  noteSeen(page.seen, contentOf(page), contentId, season);
}

// No dropdown: the one season the page fetched, only when Naka says the series has one season and its
// episode grid is there (a series of several seasons prefetches others).
function onlySeason(scope: FicheScope, contentId: number): number | undefined {
  if (scope.page.numberOfSeasons !== 1) return undefined;
  if (!scope.ports.hasEpisodeGrid()) return undefined;
  const seasons = seasonsOf(scope.page.seen, contentId);
  return seasons.length === 1 ? seasons[0] : undefined;
}

// From 1 to Naka's season count, or to MAX_SEASON_COUNT when Naka gave none: a page rewriting its
// dropdown to « Saison N » would otherwise cost one SensCritique read per N.
function canHaveSeason(page: FichePage, season: number): boolean {
  return season >= 1 && season <= (page.numberOfSeasons ?? MAX_SEASON_COUNT);
}

function seasonShown(scope: FicheScope): number | undefined {
  const { page, ports } = scope;
  const contentId = contentOf(page);
  if (page.title.mediaType !== "tv" || contentId === undefined) return;
  if (page.info?.product === undefined) return;
  // The worker reads a season from the content and its number alone: the dropdown's season opens even
  // when the page fetched it before the tab listened.
  return ports.shownSeason() ?? onlySeason(scope, contentId);
}

/** A new season event of this content for the shown season whose read failed asks it once more. */
export function retrySeason(
  scope: FicheScope,
  contentId: number,
  season: number,
): boolean {
  const { page } = scope;
  if (contentId !== contentOf(page) || page.season !== season) return false;
  if (page.failedSeason !== season || page.retriedSeason === season) {
    return false;
  }
  page.retriedSeason = season;
  openSeason(scope, season);
  return true;
}

export function considerSeason(scope: FicheScope): void {
  const season = seasonShown(scope);
  if (season === undefined) return;
  if (!canHaveSeason(scope.page, season)) closeSeason(scope);
  else if (season !== scope.page.season) openSeason(scope, season);
}

function openSeason(scope: FicheScope, season: number): void {
  const { page } = scope;
  const turn = {};
  page.turn = turn;
  page.season = season;
  page.failedSeason = undefined;
  page.episodes = page.read.get(season) ?? new Map();
  scope.reads.cancel();
  scope.show();
  const live = () => scope.live() && page.turn === turn;
  if (page.read.has(season)) readMine(scope, season, live);
  else void fetchSeason(scope, season, live);
}

function episodesOf(answer: SeasonAnswer): Episodes {
  return new Map(
    answer.episodes.map(({ episode, ...values }) => [episode, values]),
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
  if (!live()) return;
  if (answer === undefined) {
    failSeason(scope, season);
    return;
  }
  storeEpisodes(scope.page, season, episodesOf(answer));
  scope.show();
  readMine(scope, season, live);
}

function failSeason(scope: FicheScope, season: number): void {
  scope.page.failedSeason = season;
  scope.show();
}

/** No season shown: its reads stop and its late answers change nothing. */
function dropShownSeason(scope: FicheScope): void {
  const { page } = scope;
  page.turn = undefined;
  page.season = undefined;
  page.failedSeason = undefined;
  page.episodes = new Map();
  scope.reads.cancel();
}

// A dropdown naming a season the title cannot have shows no season: no box keeps another season's
// episodes. The seasons read stay for the visit.
function closeSeason(scope: FicheScope): void {
  if (scope.page.season === undefined) return;
  dropShownSeason(scope);
  scope.show();
}

/** The visit's seasons forgotten (a new info resets what the worker issued to the tab). */
export function forgetSeasons(scope: FicheScope): void {
  dropShownSeason(scope);
  scope.page.retriedSeason = undefined;
  scope.page.read.clear();
}
