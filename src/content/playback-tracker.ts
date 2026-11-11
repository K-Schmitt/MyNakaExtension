// Turns video samples into "finished" candidates for the worker. Pure: no `chrome.*`, no DOM, no clock.
// The tracker does not know the stored threshold. It offers each mark of PROGRESS_MARKS once per key and
// the worker ignores the candidates below its threshold. A film left after 30 s never reaches a mark.
//
// A sample counts only when it is consistent (a real duration, a position inside it, a duration that
// holds steady) and comes from the video source of the current context: Naka changes the URL before the
// <video> loads the next source, so samples of the previous source are ignored.
//
// When Naka's page has learnt where the credits start (credits events), a counted sample at or past that
// start offers one "credits" finish per key, with its real progress, provided the start is at or past
// CREDITS_FLOOR of the video. The page names an episode by its season and episode only, a film by neither,
// so a start is bound to the content playing when it arrives (none playing: it is ignored).

import { contentKeyOf } from "../core/finish-event";
import type { PageEvent, ToWorker } from "../ext/messages";
import {
  type CreditsStarts,
  contextKey,
  createCreditsStarts,
  eventKey,
  pastCredits,
} from "./credits-starts";
import type { PlayerContext } from "./page-events";

export type FinishedMessage = Extract<ToWorker, { type: "finished" }>;

// The worker completes at the first mark that is >= its threshold for the kind. The marks are therefore
// exactly the grid of the thresholds (THRESHOLD_CHOICES), not a range: an off-mark value would complete
// at the next mark up.
export const PROGRESS_MARKS: readonly number[] = [0.8, 0.85, 0.9, 0.95, 0.99];
// Five minutes rule out trailers and short ads; real films and episodes are longer.
export const DURATION_FLOOR_S = 300;
const DURATION_TOLERANCE = 0.02;
const MAX_KEYS = 200;

type Playing = { contentId: number; season?: number; episode?: number };

type KeyState = { marks: Set<number>; watched: boolean; credits: boolean };

type VideoSample = { currentTime: number; duration: number; src: string };

type Reference = { src: string; duration: number };

export type PlaybackTracker = {
  context(ctx: PlayerContext | undefined): void;
  sample(s: VideoSample): FinishedMessage | undefined;
  watched(ev: PageEvent): FinishedMessage | undefined;
  /** Where the credits start, for the episode (or the film) the event names. */
  credits(ev: PageEvent): void;
  /** An unticked « vu »: that key can send its explicit finish again. */
  unwatched(ev: PageEvent): void;
};

// The worker keys the same content with the same function.
function keyOf(p: Playing): string {
  return contentKeyOf(p);
}

function idsOf(p: Playing): Playing {
  return p.season === undefined || p.episode === undefined
    ? { contentId: p.contentId }
    : { contentId: p.contentId, season: p.season, episode: p.episode };
}

function sameKey(a: Playing | undefined, b: Playing | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return keyOf(a) === keyOf(b);
}

// A real duration and a position inside it.
function isPlausible(s: VideoSample): boolean {
  if (!Number.isFinite(s.duration) || s.duration < DURATION_FLOOR_S) {
    return false;
  }
  // NaN fails both comparisons, and Infinity exceeds the duration.
  return s.currentTime >= 0 && s.currentTime <= s.duration;
}

function isSteady(reference: Reference, duration: number): boolean {
  return (
    Math.abs(duration - reference.duration) <=
    DURATION_TOLERANCE * reference.duration
  );
}

function finishedAt(
  playing: Playing,
  source: "threshold" | "credits",
  progress: number,
): FinishedMessage {
  return { type: "finished", source, progress, ...idsOf(playing) };
}

export function createPlaybackTracker(): PlaybackTracker {
  const states = new Map<string, KeyState>();
  const starts: CreditsStarts = createCreditsStarts();
  let current: Playing | undefined;
  let creditsKey: string | undefined;
  let previousSrc: string | undefined;
  let lastSrc: string | undefined;
  let reference: Reference | undefined;

  function stateOf(p: Playing): KeyState {
    const key = keyOf(p);
    const known = states.get(key);
    if (known !== undefined) return known;
    if (states.size >= MAX_KEYS) {
      const oldest = states.keys().next().value;
      if (oldest !== undefined) states.delete(oldest);
    }
    const fresh = { marks: new Set<number>(), watched: false, credits: false };
    states.set(key, fresh);
    return fresh;
  }

  // Marks the progress has reached and not yet offered. All are consumed, only the highest is sent.
  function newMarks(state: KeyState, progress: number): number[] {
    const reached = PROGRESS_MARKS.filter(
      (mark) => progress >= mark && !state.marks.has(mark),
    );
    for (const mark of reached) state.marks.add(mark);
    return reached;
  }

  // Leaving a context: its video source becomes the stale one, unless it never played anything.
  function leaveContext(): void {
    if (lastSrc !== undefined) previousSrc = lastSrc;
    lastSrc = undefined;
    reference = undefined;
  }

  function isCurrentSrc(src: string): boolean {
    return src !== "" && src !== previousSrc;
  }

  // The first counted sample of a source sets the reference duration; later ones must stay within 2%.
  function isConsistent(s: VideoSample): boolean {
    if (!isPlausible(s)) return false;
    if (reference === undefined || reference.src !== s.src) {
      reference = { src: s.src, duration: s.duration };
      return true;
    }
    return isSteady(reference, s.duration);
  }

  return {
    context(ctx) {
      const next = ctx === undefined ? undefined : idsOf(ctx);
      if (sameKey(current, next)) return;
      leaveContext();
      current = next;
      creditsKey = ctx === undefined ? undefined : contextKey(ctx);
    },
    sample(s) {
      if (current === undefined || !isCurrentSrc(s.src)) return undefined;
      lastSrc = s.src;
      if (!isConsistent(s)) return undefined;
      const state = stateOf(current);
      const progress = s.currentTime / s.duration;
      const reached = newMarks(state, progress);
      const startS =
        creditsKey === undefined ? undefined : starts.of(creditsKey);
      if (!state.credits && pastCredits(startS, s)) {
        state.credits = true;
        return finishedAt(current, "credits", progress);
      }
      const highest = reached[reached.length - 1];
      if (highest === undefined) return undefined;
      return finishedAt(current, "threshold", highest);
    },
    credits(ev) {
      if (ev.kind !== "credits" || current === undefined) return;
      starts.remember(eventKey(current.contentId, ev), ev.startMs);
    },
    unwatched(ev) {
      if (ev.kind !== "unwatched") return;
      const state = states.get(keyOf(idsOf(ev)));
      if (state !== undefined) state.watched = false;
    },
    watched(ev) {
      if (ev.kind !== "watched") return undefined;
      const playing = idsOf(ev);
      const state = stateOf(playing);
      if (state.watched) return undefined;
      state.watched = true;
      return {
        type: "finished",
        source: "explicit",
        progress: 1,
        ...playing,
      };
    },
  };
}
