// Naka's season list of a series: which seasons exist and how many episodes each holds.
// The answer is `{ seasons: [1, 2], episodeCounts: { "1": 16, "2": 25 } }`: JSON keys are strings, so each
// key must be a positive integer written without sign, zero or leading zero, and each count a positive
// integer. Anything doubtful refuses the whole answer: the caller then keeps its fallback.

import { isPositiveId } from "./naka-input";
import { isRecord } from "./naka-transport";

export type NakaSeasons = {
  seasons: number[];
  episodeCounts: Record<number, number>;
};

const SEASON_KEY = /^[1-9]\d*$/;

function toList(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const list: unknown[] = value;
  return list.every(isPositiveId) ? [...list] : undefined;
}

function toCounts(value: unknown): Record<number, number> | undefined {
  if (!isRecord(value)) return undefined;
  const counts: Record<number, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (!SEASON_KEY.test(key) || !isPositiveId(count)) return undefined;
    const season = Number(key);
    if (!isPositiveId(season)) return undefined;
    counts[season] = count;
  }
  return counts;
}

export function toSeasons(json: unknown): NakaSeasons | undefined {
  if (!isRecord(json)) return undefined;
  const seasons = toList(json.seasons);
  const episodeCounts = toCounts(json.episodeCounts);
  if (seasons === undefined || episodeCounts === undefined) return undefined;
  return { seasons, episodeCounts };
}
