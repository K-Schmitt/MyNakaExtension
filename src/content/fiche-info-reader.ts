// The title's SensCritique info: asked once per visit from the page's `fiche` event of the title the tab's
// address names (its own tmdbId, never the event's), again after a link, and on « Réessayer » once a read
// failed (spec 8b §2). Its product opens the seasons.

import type { FicheScope } from "./fiche-page";
import type { TitlePageEvent } from "./fiche-ports";
import { considerSeason } from "./fiche-season-reader";
import { keepContent } from "./fiche-seen-seasons";
import { watchUndoExpiry } from "./fiche-undo-expiry";

type FicheEventOf = Extract<TitlePageEvent, { kind: "fiche" }>;

export function onFiche(scope: FicheScope, event: FicheEventOf): void {
  const { page } = scope;
  if (page.infoMessage !== undefined) return;
  const { tmdbId, mediaType } = page.title;
  if (event.tmdbId !== tmdbId || event.mediaType !== mediaType) return;
  page.infoMessage = {
    type: "fiche-info",
    contentId: event.contentId,
    tmdbId,
    mediaType,
    ...(event.title === undefined ? {} : { title: event.title }),
    ...(event.originalTitle === undefined
      ? {}
      : { originalTitle: event.originalTitle }),
    ...(event.year === undefined ? {} : { year: event.year }),
  };
  if (event.numberOfSeasons !== undefined) {
    page.numberOfSeasons = event.numberOfSeasons;
  }
  keepContent(page.seen, event.contentId);
  void askInfo(scope);
}

export async function askInfo(scope: FicheScope): Promise<void> {
  const { page } = scope;
  const msg = page.infoMessage;
  if (msg === undefined) return;
  page.info = undefined;
  page.infoFailed = undefined;
  watchUndoExpiry(scope);
  const answer = await scope.ports.info(msg);
  if (!scope.live()) return;
  if (answer === undefined) page.infoFailed = true;
  else page.info = answer;
  watchUndoExpiry(scope);
  scope.show();
  considerSeason(scope);
}

/**
 * « Réessayer »: the visit's fiche-info once more, only after its last read failed (never while one is on
 * its way, nor while a write is). The last write's line stays (spec §4: what an undo did not put back).
 */
export function retryInfo(scope: FicheScope): void {
  const { page } = scope;
  if (page.info !== undefined || page.infoFailed !== true) return;
  if (page.pending !== undefined) return;
  void askInfo(scope);
  scope.show();
}
