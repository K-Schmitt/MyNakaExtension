// The wait for a card after a viewing ended. The worker needs a moment to make the card, so the tab asks
// at fixed times counted from the end, and stops at the first card that still has something to rate.

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

export function startEndPoll(
  asker: CardAsker,
  timer: EndTimer,
  ids: ContentIds,
  onFound: Found,
): void {
  let done = false;
  const handles: unknown[] = [];

  async function poll(): Promise<void> {
    if (done) return;
    const answer = await asker.askCard(ids);
    const card = answer?.card;
    if (done || card === undefined || card === null) return;
    if (card.pending.length === 0) return;
    done = true;
    for (const handle of handles) timer.clear(handle);
    onFound(card, answer?.start);
  }

  for (const ms of END_POLL_MS) {
    handles.push(
      timer.set(() => {
        void poll();
      }, ms),
    );
  }
}
