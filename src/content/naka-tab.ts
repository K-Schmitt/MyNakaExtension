// The Naka tab's own work, from what the entry file binds: it says the tab is ready, follows the player
// URL, samples the <video>, and relays what the MAIN world saw. Everything it sends is rebuilt by the
// tracker or the parsers: ids and marks only, never page text.

import { type ContentIds, contentKeyOf } from "../core/finish-event";
import type { PageEvent, ToWorker } from "../ext/messages";
import {
  acceptPageEvent,
  type PlayerContext,
  parsePlayerUrl,
} from "./page-events";
import {
  createPlaybackTracker,
  type PlaybackTracker,
} from "./playback-tracker";

// Ruling 10: Naka is a single-page app, so the URL is polled every second; the video every 5 s.
export const URL_POLL_MS = 1000;
export const SAMPLE_MS = 5000;

export type VideoSample = {
  currentTime: number;
  duration: number;
  src: string;
};
export type PageMessage = { source: unknown; origin: string; data: unknown };

export type TabEnv = {
  /** The tab's window: a page message must come from it. */
  self: unknown;
  href(): string;
  video(): VideoSample | undefined;
  every(ms: number, fn: () => void): void;
  onPageMessage(fn: (ev: PageMessage) => void): void;
  send(msg: ToWorker): void;
  /** The viewing of these ids just ended: the end block starts waiting for its card. */
  finished(ids: ContentIds): void;
  /** The player URL now holds these ids (none off a player page): the pause block counts from here. */
  urlChanged(ids: ContentIds | undefined): void;
  /** The page's pathname, at every URL poll (empty when the href is not a URL): the home block follows it. */
  pathChanged(pathname: string): void;
  /** Naka just answered a removal of this title from « Ma liste » (an id the page reported). */
  removed(contentId: number): void;
};

type FinishedMessage = Extract<ToWorker, { type: "finished" }>;

function idsOf({ contentId, season, episode }: ContentIds): ContentIds {
  return {
    contentId,
    ...(season === undefined ? {} : { season }),
    ...(episode === undefined ? {} : { episode }),
  };
}

// Each finished the tab sends, threshold or explicit, is also told to the end block.
function sendFinished(env: TabEnv, msg: FinishedMessage): void {
  env.send(msg);
  env.finished(idsOf(msg));
}

function relay(env: TabEnv, tracker: PlaybackTracker, event: PageEvent) {
  if (event.kind === "playlist") {
    env.send({ type: "playlist-changed" });
    if (event.removed !== undefined) env.removed(event.removed);
    return;
  }
  if (event.kind === "unwatched") {
    tracker.unwatched(event);
    env.send({ type: "forget-handled", ...idsOf(event) });
    return;
  }
  const finished = tracker.watched(event);
  if (finished) sendFinished(env, finished);
}

function idsOfContext(ctx: PlayerContext | undefined): ContentIds | undefined {
  if (ctx === undefined) return undefined;
  const { contentId, season, episode } = ctx;
  return {
    contentId,
    ...(season === undefined ? {} : { season }),
    ...(episode === undefined ? {} : { episode }),
  };
}

function pathOf(href: string): string {
  try {
    return new URL(href).pathname;
  } catch {
    return "";
  }
}

const keyOfIds = (ids: ContentIds | undefined): string =>
  ids === undefined ? "" : contentKeyOf(ids);

export function startNakaTab(env: TabEnv): void {
  const tracker = createPlaybackTracker();
  let lastKey = "";
  // The tracker ignores a context it already follows, so the URL is handed over at every poll.
  const follow = (): void => {
    const href = env.href();
    env.pathChanged(pathOf(href));
    const ctx = parsePlayerUrl(href);
    tracker.context(ctx);
    const ids = idsOfContext(ctx);
    if (keyOfIds(ids) === lastKey) return;
    lastKey = keyOfIds(ids);
    env.urlChanged(ids);
  };
  // A URL change reaches the tracker before the sample, so that a sample never counts for the content
  // the page just left.
  const sample = (): void => {
    follow();
    const video = env.video();
    const finished = video === undefined ? undefined : tracker.sample(video);
    if (finished) sendFinished(env, finished);
  };
  env.send({ type: "naka-ready" });
  env.every(URL_POLL_MS, follow);
  env.every(SAMPLE_MS, sample);
  env.onPageMessage((ev) => {
    const event = acceptPageEvent(ev, env.self);
    if (event) relay(env, tracker, event);
  });
}
