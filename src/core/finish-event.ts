// The end-of-viewing event the Naka page reports, checked once before the handler touches anything.
// It crosses a message boundary in Plan 3, so the types are not trusted at runtime: a bad event
// rejects with a fixed message (never one built from its values) before any port is called.

import type { Titled } from "./title-match";

export type FinishEvent = {
  source: "threshold" | "explicit";
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
  source: "threshold" | "explicit";
  progress: number;
  contentId: number;
  titled: Titled;
};

export type CheckedEvent =
  | (Checked & { kind: "film" })
  | (Checked & { kind: "episode"; season: number; episode: number });

function reject(message: string): never {
  throw new RangeError(`finish event: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function checkCommon(event: FinishEvent): Checked {
  if (!isObject(event) || !isObject(event.naka) || !isObject(event.titled)) {
    reject("malformed event");
  }
  const { source, progress, naka, titled } = event;
  if (source !== "threshold" && source !== "explicit") reject("unknown source");
  if (!isPositiveId(naka.contentId)) {
    reject("contentId must be a positive safe integer");
  }
  if (!(Number.isFinite(progress) && progress >= 0)) {
    reject("progress must be a finite number >= 0");
  }
  if (typeof titled.title !== "string" || titled.title.trim() === "") {
    reject("title must not be empty");
  }
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

export function contentKey(event: CheckedEvent): string {
  return event.kind === "film"
    ? `movie:${event.contentId}`
    : `tv:${event.contentId}:S${event.season}E${event.episode}`;
}
