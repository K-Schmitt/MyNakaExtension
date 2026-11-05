// The owner's end-of-viewing settings, read from storage: a threshold per kind (each on the grid of
// THRESHOLD_CHOICES) and the progress from which the end block may appear. Fails closed like the rest.

import { THRESHOLD_CHOICES, type Thresholds } from "../core/watch-trigger";
import { asInt, asRecord, fail, onlyKeys, valuesOf } from "./field-checks";

const MAX_PAUSE_FROM_PERCENT = 99;

// A Record, so that a field added to Thresholds without being added here does not compile.
const THRESHOLD_KEYS = valuesOf<keyof Thresholds>({
  film: true,
  episode: true,
});

function parseChoice(raw: unknown, path: string): number {
  const found = THRESHOLD_CHOICES.find((choice) => choice === raw);
  return found === undefined ? fail(path) : found;
}

export function parseThresholds(raw: unknown): Thresholds {
  const path = "settings.thresholds";
  const record = asRecord(raw, path);
  onlyKeys(record, THRESHOLD_KEYS, path);
  return {
    film: parseChoice(record.film, `${path}.film`),
    episode: parseChoice(record.episode, `${path}.episode`),
  };
}

export function parsePauseFromPercent(raw: unknown): number {
  const path = "settings.pauseFromPercent";
  const percent = asInt(raw, 0, path);
  return percent > MAX_PAUSE_FROM_PERCENT ? fail(path) : percent;
}
