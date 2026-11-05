// The end of a season and of a series, in ONE rule. Naka's per-season episode count decides the season when
// it is known, and SensCritique's "last episode of the season" is the fallback. The series is finished when
// the season is the last one and Naka's last season is known and reached.

export type SeasonPosition = { season: number; episode: number };
export type SeasonFacts = { episodesInSeason?: number; lastSeason?: number };
export type SeasonEnd = { lastOfSeason: boolean; seriesFinished: boolean };

export function seasonEnd(
  position: SeasonPosition,
  facts: SeasonFacts,
  scLastOfSeason: boolean,
): SeasonEnd {
  const lastOfSeason =
    facts.episodesInSeason !== undefined
      ? position.episode >= facts.episodesInSeason
      : scLastOfSeason;
  const seriesFinished =
    lastOfSeason &&
    facts.lastSeason !== undefined &&
    position.season >= facts.lastSeason;
  return { lastOfSeason, seriesFinished };
}
