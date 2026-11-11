// Where the credits start, as Naka's page learnt it, for the last few contents a tab played. Pure: no
// `chrome.*`, no DOM, no clock. The page names an episode by its season and episode only, a film by
// neither, so the tracker binds each start to the content playing when it arrived: its contentId (a
// series' id for an episode) and that place.

import { CREDITS_FLOOR } from "../core/watch-trigger";

type Place = { season?: number; episode?: number };
type Sample = { currentTime: number; duration: number };
type Context = Place & { contentId: number; mediaType: "movie" | "tv" };

// The page asks once per episode opened: a handful covers the episodes a tab moves through.
export const MAX_CREDITS_STARTS = 8;

export type CreditsStarts = {
  remember(key: string, startMs: number): void;
  /** The credits start under that key, in seconds, or undefined. */
  of(key: string): number | undefined;
};

function episodePlace({ season, episode }: Place): string | undefined {
  return season === undefined || episode === undefined
    ? undefined
    : `S${season}E${episode}`;
}

/** The key of what a credits event names, bound to the content playing when it arrived. */
export function eventKey(contentId: number, ev: Place): string {
  return `${contentId}:${episodePlace(ev) ?? "film"}`;
}

/** The key the current context looks up; undefined for a tv context without its episode. */
export function contextKey(ctx: Context): string | undefined {
  if (ctx.mediaType === "movie") return `${ctx.contentId}:film`;
  const place = episodePlace(ctx);
  return place === undefined ? undefined : `${ctx.contentId}:${place}`;
}

export function createCreditsStarts(): CreditsStarts {
  const starts = new Map<string, number>();
  return {
    remember(key, startMs) {
      starts.delete(key);
      if (starts.size >= MAX_CREDITS_STARTS) {
        const oldest = starts.keys().next().value;
        if (oldest !== undefined) starts.delete(oldest);
      }
      starts.set(key, startMs / 1000);
    },
    of(key) {
      return starts.get(key);
    },
  };
}

// A known start, at or past the floor of the video, that the position has reached. A start below the floor
// is ignored: the threshold applies.
export function pastCredits(startS: number | undefined, s: Sample): boolean {
  if (startS === undefined) return false;
  return startS / s.duration >= CREDITS_FLOOR && s.currentTime >= startS;
}
