// Turns video samples into "finished" candidates for the worker. Pure: no `chrome.*`, no DOM, no clock.
// The tracker does not know the stored threshold. It offers each mark of PROGRESS_MARKS once per key and
// the worker ignores the candidates below its threshold. A film left after 30 s never reaches a mark.

import type { PageEvent, ToWorker } from "../ext/messages";
import type { PlayerContext } from "./page-events";

export type FinishedMessage = Extract<ToWorker, { type: "finished" }>;

export const PROGRESS_MARKS: readonly number[] = [0.85, 0.9, 0.95, 0.99];
const MIN_DURATION_SECONDS = 60;

type Playing = { contentId: number; season?: number; episode?: number };

type KeyState = { marks: Set<number>; watched: boolean };

export type PlaybackTracker = {
  context(ctx: PlayerContext | undefined): void;
  sample(s: {
    currentTime: number;
    duration: number;
  }): FinishedMessage | undefined;
  watched(ev: PageEvent): FinishedMessage | undefined;
};

function keyOf(p: Playing): string {
  return p.season === undefined || p.episode === undefined
    ? `movie:${p.contentId}`
    : `tv:${p.contentId}:S${p.season}E${p.episode}`;
}

function idsOf(p: Playing): Playing {
  return p.season === undefined || p.episode === undefined
    ? { contentId: p.contentId }
    : { contentId: p.contentId, season: p.season, episode: p.episode };
}

// null when the sample says nothing: no real duration, or a time that is not a position in it.
function progressOf(s: { currentTime: number; duration: number }) {
  const { currentTime, duration } = s;
  if (!Number.isFinite(duration) || duration <= MIN_DURATION_SECONDS) {
    return null;
  }
  if (!Number.isFinite(currentTime)) return null;
  return currentTime / duration;
}

export function createPlaybackTracker(): PlaybackTracker {
  const states = new Map<string, KeyState>();
  let current: Playing | undefined;

  function stateOf(p: Playing): KeyState {
    const key = keyOf(p);
    const known = states.get(key);
    if (known !== undefined) return known;
    const fresh = { marks: new Set<number>(), watched: false };
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

  return {
    context(ctx) {
      current = ctx === undefined ? undefined : idsOf(ctx);
    },
    sample(s) {
      const progress = progressOf(s);
      if (current === undefined || progress === null) return undefined;
      const reached = newMarks(stateOf(current), progress);
      const highest = reached[reached.length - 1];
      if (highest === undefined) return undefined;
      return {
        type: "finished",
        source: "threshold",
        progress: highest,
        ...idsOf(current),
      };
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
