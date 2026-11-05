// The waits for a card. The worker needs a moment to make or change a card, so the tab asks at fixed
// times counted from the event (the end of a viewing, a click), and stops when the answer says enough.

import type { ContentIds } from "../../core/finish-event";
import type { RatingCard } from "../../core/rating-cards";
import type { CardAnswer } from "../../sw/rating-answers";

export const END_POLL_MS = [2000, 5000, 10000, 20000, 40000];

export type EndTimer = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export type CardAsker = {
  askCard(ids: ContentIds): Promise<CardAnswer | undefined>;
};

export type Found = (card: RatingCard, start?: number) => void;

// A port that rejects is a worker that did not answer, never an error that escapes.
export async function askOrNothing(
  asker: CardAsker,
  ids: ContentIds,
): Promise<CardAnswer | undefined> {
  try {
    return await asker.askCard(ids);
  } catch {
    return undefined;
  }
}

/**
 * Asks on the schedule. `judge` returns true when the answer settles the wait (the poll then stops);
 * `onEnd` runs when the schedule is spent unsettled, told whether any ask was answered at all.
 */
export function pollUntil(
  asker: CardAsker,
  timer: EndTimer,
  ids: ContentIds,
  judge: (answer: CardAnswer | undefined) => boolean,
  onEnd: (answered: boolean) => void,
): () => void {
  let done = false;
  let left = END_POLL_MS.length;
  let answered = false;
  const handles: unknown[] = [];
  const stop = (): void => {
    done = true;
    for (const handle of handles) timer.clear(handle);
  };

  async function poll(): Promise<void> {
    if (done) return;
    const answer = await askOrNothing(asker, ids);
    if (done) return;
    if (answer !== undefined) answered = true;
    if (judge(answer)) {
      stop();
      return;
    }
    left -= 1;
    if (left === 0) {
      done = true;
      onEnd(answered);
    }
  }

  for (const ms of END_POLL_MS) {
    handles.push(
      timer.set(() => {
        void poll();
      }, ms),
    );
  }
  return stop;
}

export function startEndPoll(
  asker: CardAsker,
  timer: EndTimer,
  ids: ContentIds,
  onFound: Found,
  onMissed: () => void,
): void {
  pollUntil(
    asker,
    timer,
    ids,
    (answer) => {
      const card = answer?.card;
      if (card === undefined || card === null || card.pending.length === 0) {
        return false;
      }
      onFound(card, answer?.start);
      return true;
    },
    onMissed,
  );
}
