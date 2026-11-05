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

// A playlist event: it may report the id of the title just removed from « Ma liste » (absent, or a positive
// safe integer: anything else refuses the whole event). The channel is the caller's, to avoid an import cycle.
export function playlistEvent<C extends string>(
  channel: C,
  record: Record<string, unknown>,
): { channel: C; kind: "playlist"; removed?: number } {
  const removed = whenPresent(record.removed, (v) => asId(v, "removed"));
  const base = { channel, kind: "playlist" } as const;
  return removed === undefined ? base : { ...base, removed };
}
