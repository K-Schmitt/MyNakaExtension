// The end block: when a viewing ends, it waits for the card, shows its first pending label over the player,
// and walks the chain (épisode, saison, série). The send itself (lock, re-ask, move-on) is the shared
// rating session; this file owns the wait for the card and the queue of cards behind the shown one.
// Leaving the player closes the shown card and drops the waits: the cards stay pending, for the home panel.

import { type ContentIds, contentKeyOf } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import { askOrNothing, startEndPoll } from "./end-poll";
import { createRatingSession, type SessionPorts } from "./rating-session";
import { labelOf } from "./session-views";

export type { EndTimer } from "./end-poll";

export type EndPorts = SessionPorts & {
  /** Runs just before a card opens: the overlay is about to be the end block's. */
  opening(): void;
};

export function createEndBlock(ports: EndPorts) {
  const seen = new Set<string>();
  const waits = new Map<string, () => void>(); // the polls still waiting for a card, by key
  const queue: ContentIds[] = [];
  const session = createRatingSession(ports, () => {
    openNext().catch(() => {});
  });

  function offer(
    ids: ContentIds,
    card: RatingCard,
    start?: number,
    sending?: RatingLabel[],
  ): void {
    if (session.isOpen()) {
      queue.push(ids);
      return;
    }
    const label = labelOf(card);
    if (label === undefined) return;
    ports.opening();
    session.open(ids, card, label, { start, sending });
  }

  async function openNext(): Promise<void> {
    for (let ids = queue.shift(); ids !== undefined; ids = queue.shift()) {
      const answer = await askOrNothing(ports.port, ids);
      if (answer?.card && answer.card.pending.length > 0) {
        offer(ids, answer.card, answer.start, answer.sending);
        return;
      }
    }
  }

  return {
    finished(ids: ContentIds): void {
      const key = contentKeyOf(ids);
      if (seen.has(key)) return;
      seen.add(key);
      // A window that found no card to rate is not final: a later finished for the key polls again.
      const stop = startEndPoll(
        ports.port,
        ports.timer,
        ids,
        (card, start, sending) => {
          waits.delete(key);
          offer(ids, card, start, sending);
        },
        () => {
          waits.delete(key);
          seen.delete(key);
        },
      );
      waits.set(key, stop);
    },
    /** Off the player: the queue and the waits go (a later finished polls again), the shown card closes. */
    leave(): void {
      queue.length = 0;
      for (const [key, stop] of waits) {
        stop();
        seen.delete(key);
      }
      waits.clear();
      session.closeShown();
    },
    isShown: (): boolean => session.isOpen(),
  };
}
