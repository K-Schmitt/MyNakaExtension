// The title's SensCritique info: asked once per visit from the page's `fiche` event of the title the tab's
// address names (its own tmdbId, never the event's), and again after a link. Its product opens the seasons.

import type { FicheScope } from "./fiche-page";
import type { TitlePageEvent } from "./fiche-ports";
import { considerSeason } from "./fiche-season-reader";
import { keepContent } from "./fiche-seen-seasons";

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
    title: event.title,
    ...(event.originalTitle === undefined
      ? {}
      : { originalTitle: event.originalTitle }),
    ...(event.year === undefined ? {} : { year: event.year }),
  };
  keepContent(page.seen, event.contentId);
  void askInfo(scope);
}

export async function askInfo(scope: FicheScope): Promise<void> {
  const { page } = scope;
  const msg = page.infoMessage;
  if (msg === undefined) return;
  page.info = undefined;
  const answer = await scope.ports.info(msg);
  if (!scope.live()) return;
  if (answer === undefined) page.outcome = { kind: "failed" };
  else page.info = answer;
  scope.show();
  considerSeason(scope);
}
