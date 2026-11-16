// What Naka says of the seasons, turned into the facts seasonEnd reads: the episode count of the season
// played and the highest season. With no list, the catalogue's numberOfSeasons is the only fact left.
// The list counts RELEASED episodes only, while the catalogue's numberOfEpisodes counts the announced ones:
// when the list falls short of it, the season still airing is the last one, and the missing episodes are
// its own (Severance, 2026-11-06: 7 released of 8, the 7th looked like the end of the series).

import type { NakaSeasons } from "../naka/naka-seasons";
import type { SeasonFacts } from "./season-end";

function highestSeason(seasons: NakaSeasons): number {
  // A fold, not a spread: a long list would overflow the call stack.
  return seasons.seasons.reduce(
    (high, season) => Math.max(high, season),
    Number.NEGATIVE_INFINITY,
  );
}

function releasedEpisodes(seasons: NakaSeasons): number {
  return Object.values(seasons.episodeCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
}

/** The episodes announced but not released yet: 0 when unknown or when nothing is missing. */
function unreleasedEpisodes(
  seasons: NakaSeasons,
  numberOfEpisodes: number | undefined,
): number {
  if (numberOfEpisodes === undefined) return 0;
  return Math.max(0, numberOfEpisodes - releasedEpisodes(seasons));
}

// The missing episodes belong to the season played only when it is the last one listed AND the catalogue
// announces no later season: otherwise they are that later season's.
function isAiringSeason(
  season: number,
  lastSeason: number,
  numberOfSeasons: number | undefined,
): boolean {
  if (season !== lastSeason) return false;
  return numberOfSeasons === undefined || numberOfSeasons <= lastSeason;
}

export function seasonFactsOf(
  seasons: NakaSeasons | undefined,
  season: number,
  numberOfSeasons: number | undefined,
  numberOfEpisodes?: number,
): SeasonFacts {
  if (seasons === undefined) return { lastSeason: numberOfSeasons };
  const lastSeason = highestSeason(seasons);
  const released = seasons.episodeCounts[season];
  const airing = isAiringSeason(season, lastSeason, numberOfSeasons)
    ? unreleasedEpisodes(seasons, numberOfEpisodes)
    : 0;
  return {
    episodesInSeason: released === undefined ? undefined : released + airing,
    lastSeason,
  };
}
