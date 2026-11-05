// The place of a content in a series, as a message carries it.

import { asId, fail, whenPresent } from "./field-checks";

// Season and episode come as a pair: both present or both absent.
export function playbackContext(record: Record<string, unknown>): {
  season?: number;
  episode?: number;
} {
  const season = whenPresent(record.season, (v) => asId(v, "season"));
  const episode = whenPresent(record.episode, (v) => asId(v, "episode"));
  if (season === undefined && episode === undefined) return {};
  if (season === undefined || episode === undefined) return fail("episode");
  return { season, episode };
}
