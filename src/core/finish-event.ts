// The end-of-viewing event the Naka page reports, checked once before the handler touches anything.
// It crosses a message boundary in Plan 3, so the types are not trusted at runtime: a bad event
// rejects with a fixed message (never one built from its values) before any port is called.

import type { Titled } from "./title-match";

/** Where the end of viewing came from: a progress mark, Naka's « vu », or the start of the credits. */
export type FinishSource = "threshold" | "explicit" | "credits";

export type FinishEvent = {
  source: FinishSource;
  progress: number;
  /** contentId is the FILM's id, or for "tv" the SERIES' id. */
  naka: {
    contentId: number;
    mediaType: "movie" | "tv";
    season?: number;
    episode?: number;
  };
  /** The film's or the SERIES' title, never an episode title. */
  titled: Titled;
};

type Checked = {
  source: FinishSource;
  progress: number;
  contentId: number;
  titled: Titled;
};

export type CheckedEvent =
  | (Checked & { kind: "film" })
  | (Checked & { kind: "episode"; season: number; episode: number });

const SOURCES: readonly unknown[] = ["threshold", "explicit", "credits"];

function reject(message: string): never {
  throw new RangeError(`finish event: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

// A progress above 1 (a percentage passed by mistake) would complete a viewing after seconds.
function isProgress(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isYear(value: unknown): boolean {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 1800 &&
    (value as number) <= 3000
  );
}

function checkTitled(titled: Titled): void {
  if (typeof titled.title !== "string" || titled.title.trim() === "") {
    reject("title must not be empty");
  }
  const { originalTitle, year } = titled;
  if (originalTitle !== undefined && typeof originalTitle !== "string") {
    reject("originalTitle must be a string");
  }
  if (year !== undefined && !isYear(year)) {
    reject("year must be a whole number from 1800 to 3000");
  }
}

function checkCommon(event: FinishEvent): Checked {
  if (!isObject(event) || !isObject(event.naka) || !isObject(event.titled)) {
    reject("malformed event");
  }
  const { source, progress, naka, titled } = event;
  if (!SOURCES.includes(source)) reject("unknown source");
  if (!isPositiveId(naka.contentId)) {
    reject("contentId must be a positive safe integer");
  }
  if (!isProgress(progress)) {
    reject("progress must be a finite number from 0 to 1");
  }
  checkTitled(titled);
  return { source, progress, contentId: naka.contentId, titled };
}

function checkFilm(event: FinishEvent, common: Checked): CheckedEvent {
  if (event.titled.type !== "film") reject("a movie needs a film title");
  if (event.naka.season !== undefined || event.naka.episode !== undefined) {
    reject("a movie has no season or episode");
  }
  return { ...common, kind: "film" };
}

function checkEpisode(event: FinishEvent, common: Checked): CheckedEvent {
  if (event.titled.type !== "serie") reject("an episode needs a series title");
  const { season, episode } = event.naka;
  if (!isPositiveId(season) || !isPositiveId(episode)) {
    reject("season and episode must be positive safe integers");
  }
  return { ...common, kind: "episode", season, episode };
}

export function parseEvent(event: FinishEvent): CheckedEvent {
  const common = checkCommon(event);
  if (event.naka.mediaType === "movie") return checkFilm(event, common);
  if (event.naka.mediaType === "tv") return checkEpisode(event, common);
  return reject("unknown media type");
}

type KeyParts =
  | { kind: "film"; contentId: number }
  | { kind: "episode"; contentId: number; season: number; episode: number };

export type ContentIds = {
  contentId: number;
  season?: number;
  episode?: number;
};

// The one place a content key is written: the handled list, the finish record, the router's queue and
// the tab's tracker all key a content with it.
export function contentKey(event: KeyParts): string {
  return event.kind === "film"
    ? `movie:${event.contentId}`
    : `tv:${event.contentId}:S${event.season}E${event.episode}`;
}

// The key of the content some ids name: an episode when they hold both a season and an episode.
export function contentKeyOf({ contentId, season, episode }: ContentIds) {
  return contentKey(
    season !== undefined && episode !== undefined
      ? { kind: "episode", contentId, season, episode }
      : { kind: "film", contentId },
  );
}

const KEY_PARTS = /^(?:movie:(\d+)|tv:(\d+):S(\d+)E(\d+))$/;

// The inverse of contentKeyOf; undefined for anything contentKey does not write.
export function idsOfKey(key: string): ContentIds | undefined {
  const parts = KEY_PARTS.exec(key);
  if (!parts) return undefined;
  const [, film, series, season, episode] = parts;
  if (film !== undefined) return { contentId: Number(film) };
  return {
    contentId: Number(series),
    season: Number(season),
    episode: Number(episode),
  };
}
