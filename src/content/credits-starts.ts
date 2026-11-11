// Where the credits start, as Naka's page learnt it, for the last few episodes or the film it asked about.
// Pure: no `chrome.*`, no DOM, no clock. The page names an episode by its season and episode only (never
// the series), a film by neither, so an entry is keyed by that place alone.

import { CREDITS_FLOOR } from "../core/watch-trigger";

type Place = { season?: number; episode?: number };
type Credits = Place & { startMs: number };
type Sample = { currentTime: number; duration: number };

// The page asks once per episode opened: a handful covers the episodes a tab moves through.
const MAX_STARTS = 8;
const FILM_PLACE = "film";

export type CreditsStarts = {
  remember(ev: Credits): void;
  /** The credits start of that place, in seconds, or undefined. */
  of(place: Place): number | undefined;
};

function placeOf({ season, episode }: Place): string {
  return season === undefined || episode === undefined
    ? FILM_PLACE
    : `S${season}E${episode}`;
}

export function createCreditsStarts(): CreditsStarts {
  const starts = new Map<string, number>();
  return {
    remember(ev) {
      const place = placeOf(ev);
      starts.delete(place);
      if (starts.size >= MAX_STARTS) {
        const oldest = starts.keys().next().value;
        if (oldest !== undefined) starts.delete(oldest);
      }
      starts.set(place, ev.startMs / 1000);
    },
    of(place) {
      return starts.get(placeOf(place));
    },
  };
}

// A known start, at or past the floor of the video, that the position has reached. A start below the floor
// is ignored: the threshold applies.
export function pastCredits(startS: number | undefined, s: Sample): boolean {
  if (startS === undefined) return false;
  return startS / s.duration >= CREDITS_FLOOR && s.currentTime >= startS;
}
