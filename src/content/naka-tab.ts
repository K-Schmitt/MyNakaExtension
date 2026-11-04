// The Naka tab's own work, from what the entry file binds: it says the tab is ready, follows the player
// URL, samples the <video>, and relays what the MAIN world saw. Everything it sends is rebuilt by the
// tracker or the parsers: ids and marks only, never page text.

import type { PageEvent, ToWorker } from "../ext/messages";
import { acceptPageEvent, parsePlayerUrl } from "./page-events";
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
};

function relay(env: TabEnv, tracker: PlaybackTracker, event: PageEvent) {
  if (event.kind === "playlist") {
    env.send({ type: "playlist-changed" });
    return;
  }
  const finished = tracker.watched(event);
  if (finished) env.send(finished);
}

export function startNakaTab(env: TabEnv): void {
  const tracker = createPlaybackTracker();
  // The tracker ignores a context it already follows, so the URL is handed over at every poll.
  const follow = (): void => tracker.context(parsePlayerUrl(env.href()));
  // A URL change reaches the tracker before the sample, so that a sample never counts for the content
  // the page just left.
  const sample = (): void => {
    follow();
    const video = env.video();
    const finished = video === undefined ? undefined : tracker.sample(video);
    if (finished) env.send(finished);
  };
  env.send({ type: "naka-ready" });
  env.every(URL_POLL_MS, follow);
  env.every(SAMPLE_MS, sample);
  env.onPageMessage((ev) => {
    const event = acceptPageEvent(ev, env.self);
    if (event) relay(env, tracker, event);
  });
}
