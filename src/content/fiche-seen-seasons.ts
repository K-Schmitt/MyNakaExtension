// The seasons the page fetched during a visit, per content. Before the visit's content is known, every
// content counts, the oldest dropped beyond MAX_CONTENTS; once it is known, only its own seasons are kept.
// At most MAX_SEASONS per content: the page can post anything, the memory stays bounded.

export type SeenSeasons = Map<number, Set<number>>;

export const MAX_CONTENTS = 20;
export const MAX_SEASONS = 100;

export function noteSeen(
  seen: SeenSeasons,
  known: number | undefined,
  contentId: number,
  season: number,
): void {
  if (known !== undefined && contentId !== known) return;
  const seasons = seen.get(contentId) ?? new Set<number>();
  if (seasons.size < MAX_SEASONS) seasons.add(season);
  seen.delete(contentId);
  seen.set(contentId, seasons);
  const oldest = seen.keys().next().value;
  if (seen.size > MAX_CONTENTS && oldest !== undefined) seen.delete(oldest);
}

/** The visit's content is known: the seasons of every other content go. */
export function keepContent(seen: SeenSeasons, contentId: number): void {
  for (const other of [...seen.keys()]) {
    if (other !== contentId) seen.delete(other);
  }
}

export function seasonsOf(seen: SeenSeasons, contentId: number): number[] {
  return [...(seen.get(contentId) ?? [])];
}
