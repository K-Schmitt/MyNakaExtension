// The state of one visit to a title page, owned by the controller, and the scope its steps share: an
// answer that comes once the visit is over (`live()` false) changes nothing.

import type { FicheInfo } from "../ext/fiche-answers";
import type { FicheInfoMessage } from "../ext/fiche-messages";
import type { TitlePath } from "./fiche-path";
import type { FichePorts } from "./fiche-ports";
import type { ReadQueue } from "./fiche-read-queue";
import type { SeenSeasons } from "./fiche-seen-seasons";
import type {
  FicheEpisode,
  FicheOutcome,
  FichePending,
  FicheSearch,
  FicheView,
} from "./fiche-view";

export type Episodes = Map<number, FicheEpisode>;
export type EpisodePlace = { season: number; episode: number };

export type FichePage = {
  readonly title: TitlePath;
  infoMessage?: FicheInfoMessage;
  info?: FicheInfo;
  /** The last read of the info was lost: its line and « Réessayer », whatever the last write's outcome. */
  infoFailed?: true;
  /** The token of the info's read on its way, if one is: an older read's end leaves a newer one's. */
  infoReading?: object;
  outcome?: FicheOutcome;
  /** Naka's « Ma liste » the tab had to click left the screen first: its line, until the next write. */
  maListeMissed?: true;
  pending?: FichePending;
  /** The episode of the rating on its way, or of the last write's outcome; absent for another write. */
  ratedEpisode?: EpisodePlace;
  seriesRating?: number;
  /** The seasons the page's season events named. */
  readonly seen: SeenSeasons;
  season?: number;
  /** A token of the season opened last: a step of an older one is stale. */
  turn?: object;
  /** Naka's season count, from the fiche event. */
  numberOfSeasons?: number;
  /** The season whose last read failed (until a read of a season starts again). */
  failedSeason?: number;
  /** The season a new season event already asked again after a failure: one retry per visit. */
  retriedSeason?: number;
  episodes: Episodes;
  /** The seasons read during the visit. */
  readonly read: Map<number, Episodes>;
  search?: FicheSearch;
  /** The timer that stops offering « Annuler » when its record times out; its token names the live one. */
  undoExpiry?: { token: object; handle: unknown };
};

export type FicheScope = {
  readonly ports: FichePorts;
  readonly page: FichePage;
  readonly reads: ReadQueue;
  live(): boolean;
  show(): void;
};

export function newPage(title: TitlePath): FichePage {
  return { title, seen: new Map(), episodes: new Map(), read: new Map() };
}

export function viewOf(page: FichePage): FicheView {
  const view: FicheView = {
    mediaType: page.title.mediaType,
    episodes: new Map(page.episodes),
  };
  if (page.info !== undefined) view.info = page.info;
  if (page.infoFailed === true) view.infoFailed = true;
  if (page.season !== undefined) view.season = page.season;
  if (page.pending !== undefined) view.pending = page.pending;
  if (page.outcome !== undefined) view.outcome = page.outcome;
  if (page.maListeMissed === true) view.maListeMissed = true;
  if (page.season !== undefined && page.failedSeason === page.season) {
    view.seasonFailed = true;
  }
  if (page.search !== undefined) view.search = page.search;
  const fieldText = page.search?.query ?? nakaTitle(page.infoMessage);
  if (fieldText !== undefined) view.fieldText = fieldText;
  const rated = page.ratedEpisode;
  if (rated !== undefined && rated.season === page.season) {
    view.ratedEpisode = rated.episode;
  }
  return view;
}

function nakaTitle(msg: FicheInfoMessage | undefined): string | undefined {
  return msg?.title ?? msg?.originalTitle;
}

/** A new write or search starts: the last one's ending lines go. */
export function forgetEnding(page: FichePage): void {
  page.outcome = undefined;
  page.maListeMissed = undefined;
}

export function contentOf(page: FichePage): number | undefined {
  return page.infoMessage?.contentId;
}

/** The season's episodes replaced, in the visit's memory and on screen when it is the shown one. */
export function storeEpisodes(
  page: FichePage,
  season: number,
  episodes: Episodes,
): void {
  page.read.set(season, episodes);
  if (page.season === season) page.episodes = episodes;
}

/** A read average replaces the episode's; a null one keeps what the season page gave. */
export function withAverage(
  episodes: Episodes,
  episode: number,
  average: number | null,
): Episodes {
  const known = episodes.get(episode);
  if (known === undefined || average === null) return episodes;
  return new Map(episodes).set(episode, { ...known, average });
}

export function withMine(
  episodes: Episodes,
  episode: number,
  mine: number | null,
): Episodes {
  const known = episodes.get(episode);
  if (known === undefined) return episodes;
  return new Map(episodes).set(episode, { ...known, mine });
}
