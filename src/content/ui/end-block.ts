// The end block: when a viewing ends, it waits for the card, shows its first pending label over the player,
// and walks the chain (épisode, saison, série). The send itself (lock, re-ask, move-on) is the shared
// rating session; this file owns the wait for the card and the queue of cards behind the shown one.
// A title waiting on an ambiguity gets its question first (the question host), then its card.
// Leaving the player closes the shown card and drops the waits: the cards stay pending, for the home row.

import { type ContentIds, contentKeyOf } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import type { AmbiguityOffer } from "../../sw/question-offers";
import type { CardAnswer } from "../../sw/rating-answers";
import { askOrNothing, questionOf, startEndPoll } from "./end-poll";
import { createQuestionHost, type HostPorts } from "./question-host";
import { createRatingSession, type SessionPorts } from "./rating-session";
import { labelOf } from "./session-views";

export type { EndTimer } from "./end-poll";

export type EndPorts = SessionPorts &
  HostPorts & {
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
  const question = createQuestionHost(ports, (ids, linked) => {
    if (linked) wait(ids);
    openNext().catch(() => {});
  });
  let epoch = 0; // leave() starts a new one: an ask still on its way when it happens opens nothing
  const busy = (): boolean => session.isOpen() || question.isOpen();

  function offer(
    ids: ContentIds,
    card: RatingCard,
    start?: number,
    sending?: RatingLabel[],
  ): void {
    if (busy()) {
      queue.push(ids);
      return;
    }
    const label = labelOf(card);
    if (label === undefined) return;
    ports.opening();
    session.open(ids, card, label, { start, sending });
  }

  // The title waits on an ambiguity: the question comes before its rating.
  function ask(ids: ContentIds, found: AmbiguityOffer, answer: CardAnswer) {
    if (busy()) {
      queue.push(ids);
      return;
    }
    ports.opening();
    question.open(ids, found, answer);
  }

  async function openNext(): Promise<void> {
    const mine = epoch;
    for (let ids = queue.shift(); ids !== undefined; ids = queue.shift()) {
      const answer = await askOrNothing(ports.port, ids);
      if (epoch !== mine) return;
      if (answer?.card && answer.card.pending.length > 0) {
        offer(ids, answer.card, answer.start, answer.sending);
        return;
      }
      const found = questionOf(answer);
      if (answer !== undefined && found !== undefined) {
        ask(ids, found, answer);
        return;
      }
    }
  }

  // A window that found no card to rate is not final: a later finished for the key polls again.
  function wait(ids: ContentIds): void {
    const key = contentKeyOf(ids);
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
      (found, answer) => {
        waits.delete(key);
        ask(ids, found, answer);
      },
    );
    waits.set(key, stop);
  }

  return {
    finished(ids: ContentIds): void {
      const key = contentKeyOf(ids);
      if (seen.has(key)) return;
      seen.add(key);
      wait(ids);
    },
    /** Off the player: the queue and the waits go (a later finished polls again), the shown card closes. */
    leave(): void {
      epoch += 1;
      queue.length = 0;
      for (const [key, stop] of waits) {
        stop();
        seen.delete(key);
      }
      waits.clear();
      session.closeShown();
      question.closeShown();
    },
    isShown: busy,
  };
}
