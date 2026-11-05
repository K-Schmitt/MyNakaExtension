import { describe, expect, it } from "vitest";
import { seasonEnd } from "../src/core/season-end";

type Row = {
  name: string;
  position: { season: number; episode: number };
  facts: { episodesInSeason?: number; lastSeason?: number };
  scLast: boolean;
  expected: { lastOfSeason: boolean; seriesFinished: boolean };
};

const ROWS: Row[] = [
  {
    name: "no Naka fact: SensCritique's answer decides the season, the series is not known finished",
    position: { season: 3, episode: 8 },
    facts: {},
    scLast: true,
    expected: { lastOfSeason: true, seriesFinished: false },
  },
  {
    name: "no episode count and SensCritique says not last",
    position: { season: 3, episode: 2 },
    facts: { lastSeason: 3 },
    scLast: false,
    expected: { lastOfSeason: false, seriesFinished: false },
  },
  {
    name: "last season known, last episode by SensCritique: finished",
    position: { season: 3, episode: 8 },
    facts: { lastSeason: 3 },
    scLast: true,
    expected: { lastOfSeason: true, seriesFinished: true },
  },
  {
    name: "last of a season before the last: the season ends, the series does not",
    position: { season: 2, episode: 8 },
    facts: { lastSeason: 3 },
    scLast: true,
    expected: { lastOfSeason: true, seriesFinished: false },
  },
  {
    name: "a season beyond the known last season still counts as finished",
    position: { season: 4, episode: 8 },
    facts: { lastSeason: 3 },
    scLast: true,
    expected: { lastOfSeason: true, seriesFinished: true },
  },
  {
    name: "episodesInSeason reached decides, whatever SensCritique says",
    position: { season: 1, episode: 10 },
    facts: { episodesInSeason: 10 },
    scLast: false,
    expected: { lastOfSeason: true, seriesFinished: false },
  },
  {
    name: "episodesInSeason not reached contradicts SensCritique's last",
    position: { season: 1, episode: 9 },
    facts: { episodesInSeason: 10, lastSeason: 1 },
    scLast: true,
    expected: { lastOfSeason: false, seriesFinished: false },
  },
  {
    name: "an episode beyond episodesInSeason is the end",
    position: { season: 1, episode: 11 },
    facts: { episodesInSeason: 10, lastSeason: 1 },
    scLast: false,
    expected: { lastOfSeason: true, seriesFinished: true },
  },
  {
    name: "the two facts are not swapped: episode 2 of 5, season 5 of 2",
    position: { season: 5, episode: 2 },
    facts: { episodesInSeason: 5, lastSeason: 2 },
    scLast: false,
    expected: { lastOfSeason: false, seriesFinished: false },
  },
  {
    name: "the two facts are not swapped: season 2 of 5, episode 5 of 2",
    position: { season: 2, episode: 5 },
    facts: { episodesInSeason: 2, lastSeason: 5 },
    scLast: false,
    expected: { lastOfSeason: true, seriesFinished: false },
  },
  {
    name: "the last season is not reached by the position",
    position: { season: 1, episode: 4 },
    facts: { episodesInSeason: 4, lastSeason: 2 },
    scLast: true,
    expected: { lastOfSeason: true, seriesFinished: false },
  },
];

describe("seasonEnd", () => {
  it.each(ROWS)("$name", ({ position, facts, scLast, expected }) => {
    expect(seasonEnd(position, facts, scLast)).toEqual(expected);
  });
});
