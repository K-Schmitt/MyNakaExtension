// The owner's own ratings of the shown season's episodes: one read at a time, the visible boxes first,
// each episode tried once per opening. Opening another season, or leaving, stops them (`live`).

import {
  contentOf,
  type FicheScope,
  storeEpisodes,
  withMine,
} from "./fiche-page";

export function readMine(
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
