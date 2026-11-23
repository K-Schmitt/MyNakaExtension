// The Naka tab's own work, from what the entry file binds: it says the tab is ready, follows the player
// URL, samples the <video>, and relays what the MAIN world saw. Everything it sends is rebuilt by the
// tracker or the parsers: ids and marks only, never page text. The title page events go to the fiche
// controller, which sends only the parsed (capped) title of the title its own address names.
// An "unwatched" is relayed as the owner's untick (forget-handled) unless the tab noted it as its own off-click.

import { type ContentIds, contentKeyOf, idsOf } from "../core/finish-event";
import type { PageEvent, ToWorker } from "../ext/messages";
import type { FicheInput } from "./fiche-ports";
import {
  acceptPageEvent,
  type PlayerContext,
  parsePlayerUrl,
} from "./page-events";
import {
  createPlaybackTracker,
  type FinishedMessage,
  type PlaybackTracker,
} from "./playback-tracker";
import type { VideoSample } from "./video-sample";

// Naka is a single-page app, so the URL is polled every second; the video every 5 s.
const URL_POLL_MS = 1000;
const SAMPLE_MS = 5000;

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
  /** Uses up the owner's last real gesture on the page: true when it was recent enough. */
  takeGesture(): boolean;
  /** The clock, in ms: own-untick marks expire by it. */
  now(): number;
  /** The title page controller: the pathname at every URL poll, and the page's fiche and season events. */
  fiche: FicheInput;
};

// Each finished the tab sends, threshold, credits or explicit, is also told to the end block.
function sendFinished(env: TabEnv, msg: FinishedMessage): void {
  env.send(msg);
  env.finished(idsOf(msg));
}

function relay(env: TabEnv, tracker: PlaybackTracker, event: PageEvent) {
  if (event.kind === "fiche" || event.kind === "season") {
    // Naka sends them right after a navigation: the controller follows the address before the next poll.
    env.fiche.path(pathOf(env.href()));
    env.fiche.event(event);
    return;
  }
  if (event.kind === "playlist") {
    env.send({ type: "playlist-changed" });
    if (event.removed !== undefined) env.removed(event.removed);
    return;
  }
  if (event.kind === "unwatched") {
    tracker.unwatched(event);
    // Our own « Déjà vu » off-click is not the owner unticking « vu »: the title stays handled.
    if (!tracker.takeOwnUnwatched(event)) {
      env.send({ type: "forget-handled", ...idsOf(event) });
    }
    return;
  }
  if (event.kind === "credits") {
    tracker.credits(event);
    return;
  }
  const finished = tracker.watched(event, env.takeGesture);
  if (finished) sendFinished(env, finished);
}

function idsOfContext(ctx: PlayerContext | undefined): ContentIds | undefined {
  return ctx === undefined ? undefined : idsOf(ctx);
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

export type NakaTabHandle = {
  noteWatched(ids: ContentIds): void;
  noteUnwatched(ids: ContentIds): void;
};

export function startNakaTab(env: TabEnv): NakaTabHandle {
  const tracker = createPlaybackTracker(env.now);
  let lastKey = "";
  // The tracker ignores a context it already follows, so the URL is handed over at every poll.
  const follow = (): void => {
    const href = env.href();
    const pathname = pathOf(href);
    env.pathChanged(pathname);
    env.fiche.path(pathname);
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
  return {
    noteWatched: tracker.noteWatched,
    noteUnwatched: tracker.noteOwnUnwatched,
  };
}
