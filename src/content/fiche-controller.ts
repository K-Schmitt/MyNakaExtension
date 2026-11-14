// The Naka tab's title page controller: it follows the tab's address (/content/{movie|tv}/{tmdbId}) and
// the page's `fiche` and `season` events, asks the worker for the title's SensCritique info and the
// shown season's episodes, reads the owner's episode ratings one at a time, and sends the owner's writes.
// A new address ends the visit: its reads stop and its late answers change nothing.

import { onFiche, retryInfo } from "./fiche-info-reader";
import { type FicheScope, newPage, viewOf } from "./fiche-page";
import { parseTitlePath, type TitlePath } from "./fiche-path";
import type { FicheInput, FichePorts, TitlePageEvent } from "./fiche-ports";
import { createReadQueue, type ReadQueue } from "./fiche-read-queue";
import { searchTitle } from "./fiche-search";
import { considerSeason, noteSeason, retrySeason } from "./fiche-season-reader";
import { stopUndoExpiry } from "./fiche-undo-expiry";
import { removeTitle, undoTitle } from "./fiche-undo-writes";
import {
  cancelSeries,
  confirmSeries,
  link,
  rateEpisode,
  rateTitle,
} from "./fiche-writes";

export type FicheController = FicheInput & {
  rateTitle(rating: number): void;
  confirmSeries(): void;
  cancelSeries(): void;
  rateEpisode(episode: number, rating: number): void;
  link(productId: number): void;
  /** « Annuler »: puts back what the title's last rating changed. */
  undo(): void;
  /** « Retirer la note »: takes the title's rating, its seen mark and date off SensCritique. */
  remove(): void;
  /** « Chercher »: these words (trimmed) searched on SensCritique, while it found nothing. */
  search(words: string): void;
  /** « Réessayer »: the title's info read again after a failed read. */
  retry(): void;
};

function onSeason(
  scope: FicheScope,
  event: Extract<TitlePageEvent, { kind: "season" }>,
): void {
  noteSeason(scope.page, event.contentId, event.season);
  if (!retrySeason(scope, event.contentId, event.season)) {
    considerSeason(scope);
  }
}

export function createFicheController(ports: FichePorts): FicheController {
  const reads: ReadQueue = createReadQueue();
  let current: FicheScope | undefined;
  let currentPath: string | undefined;

  function visit(title: TitlePath): FicheScope {
    const page = newPage(title);
    const scope: FicheScope = {
      ports,
      page,
      reads,
      live: () => current === scope,
      show: () => {
        if (current === scope) ports.render(viewOf(page));
      },
    };
    return scope;
  }

  function moved(pathname: string): void {
    const left = current;
    currentPath = pathname;
    reads.cancel();
    if (left !== undefined) stopUndoExpiry(left);
    const title = parseTitlePath(pathname);
    current = title === undefined ? undefined : visit(title);
    if (current !== undefined) {
      current.show();
      // The page may have fetched this title before the tab listened: its relay posts it again.
      ports.announceVisit(pathname);
    } else if (left !== undefined) ports.render(undefined);
  }

  const on = (act: (scope: FicheScope) => void) => () => {
    if (current !== undefined) act(current);
  };

  return {
    path(pathname) {
      if (pathname !== currentPath) moved(pathname);
      else on(considerSeason)();
    },
    event(event) {
      on((scope) =>
        event.kind === "fiche" ? onFiche(scope, event) : onSeason(scope, event),
      )();
    },
    rateTitle: (rating) => on((scope) => rateTitle(scope, rating))(),
    confirmSeries: on(confirmSeries),
    cancelSeries: on(cancelSeries),
    rateEpisode: (episode, rating) =>
      on((scope) => rateEpisode(scope, episode, rating))(),
    link: (productId) => on((scope) => void link(scope, productId))(),
    undo: on((scope) => void undoTitle(scope)),
    remove: on((scope) => void removeTitle(scope)),
    search: (words) => on((scope) => void searchTitle(scope, words))(),
    retry: on(retryInfo),
  };
}
