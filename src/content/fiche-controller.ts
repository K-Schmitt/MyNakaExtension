// The Naka tab's title page controller: it follows the tab's address (/content/{movie|tv}/{tmdbId}) and
// the page's `fiche` and `season` events, asks the worker for the title's SensCritique info and the
// shown season's episodes, reads the owner's episode ratings one at a time, and sends the owner's writes.
// A new address ends the visit: its reads stop and its late answers change nothing.

import { onFiche } from "./fiche-info-reader";
import { type FicheScope, newPage, viewOf } from "./fiche-page";
import { parseTitlePath, type TitlePath } from "./fiche-path";
import type { FicheInput, FichePorts, TitlePageEvent } from "./fiche-ports";
import { createReadQueue, type ReadQueue } from "./fiche-read-queue";
import { considerSeason, noteSeason, retrySeason } from "./fiche-season-reader";
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
};

function onSeason(
  scope: FicheScope,
  event: Extract<TitlePageEvent, { kind: "season" }>,
): void {
  noteSeason(scope.page, event.contentId, event.season);
  if (!retrySeason(scope, event.season)) considerSeason(scope);
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
    const title = parseTitlePath(pathname);
    current = title === undefined ? undefined : visit(title);
    if (current !== undefined) current.show();
    else if (left !== undefined) ports.render(undefined);
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
  };
}
