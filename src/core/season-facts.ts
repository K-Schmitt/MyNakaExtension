// What Naka says of the seasons, turned into the facts seasonEnd reads: the episode count of the season
// played and the highest season. With no list, the catalogue's numberOfSeasons is the only fact left.

import type { NakaSeasons } from "../naka/naka-seasons";
import type { SeasonFacts } from "./season-end";

export function seasonFactsOf(
  seasons: NakaSeasons | undefined,
  season: number,
  numberOfSeasons: number | undefined,
): SeasonFacts {
  if (seasons === undefined) return { lastSeason: numberOfSeasons };
  return {
    episodesInSeason: seasons.episodeCounts[season],
    // A fold, not a spread: a long list would overflow the call stack.
    lastSeason: seasons.seasons.reduce(
      (high, season) => Math.max(high, season),
      Number.NEGATIVE_INFINITY,
    ),
  };
}
