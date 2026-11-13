// The title page events the MAIN relay keeps, to post them again to a tab that was not listening when
// the page fetched them (the isolated script starts at document_idle, and Naka serves a title it already
// fetched from its own memory). Bounded, the oldest dropped: the last fiche event of MAX_TITLES titles,
// each under its own address, and MAX_SEASONS seasons for each of MAX_CONTENTS contents.

import { PAGE_CHANNEL, type PageEvent } from "../ext/messages";

export const MAX_TITLES = 20;
export const MAX_CONTENTS = 20;
export const MAX_SEASONS = 100;

type FicheEventOf = Extract<PageEvent, { kind: "fiche" }>;
type SeasonEventOf = Extract<PageEvent, { kind: "season" }>;

export type FicheMemory = {
  keep(event: PageEvent): void;
  /** The kept fiche event whose own address is this path, then its content's seasons, oldest first. */
  replay(path: string): PageEvent[];
};

// The key becomes the newest; beyond `max` keys, the oldest goes.
function remember<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  const oldest = map.keys().next();
  if (map.size > max && oldest.done !== true) map.delete(oldest.value);
}

const titlePathOf = (event: FicheEventOf): string =>
  `/content/${event.mediaType}/${event.tmdbId}`;

const seasonEventOf = (contentId: number, season: number): SeasonEventOf => ({
  channel: PAGE_CHANNEL,
  kind: "season",
  contentId,
  season,
});

export function createFicheMemory(): FicheMemory {
  const titles = new Map<string, FicheEventOf>();
  const seasons = new Map<number, Map<number, true>>();

  function keepSeason({ contentId, season }: SeasonEventOf): void {
    const kept = seasons.get(contentId) ?? new Map<number, true>();
    remember(kept, season, true, MAX_SEASONS);
    remember(seasons, contentId, kept, MAX_CONTENTS);
  }

  return {
    keep(event) {
      if (event.kind === "fiche") {
        remember(titles, titlePathOf(event), event, MAX_TITLES);
      } else if (event.kind === "season") keepSeason(event);
    },
    replay(path) {
      const fiche = titles.get(path);
      if (fiche === undefined) return [];
      const kept = [...(seasons.get(fiche.contentId)?.keys() ?? [])];
      return [fiche, ...kept.map((n) => seasonEventOf(fiche.contentId, n))];
    },
  };
}
