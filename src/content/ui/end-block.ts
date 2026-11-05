// The end block: when a viewing ends, it waits for the card, shows its first pending label over the player,
// and walks the chain (épisode, saison, série). The send itself (lock, re-ask, move-on) is the shared
// rating session; this file owns the wait for the card and the queue of cards behind the shown one.

import { type ContentIds, contentKeyOf } from "../../core/finish-event";
import type { RatingCard } from "../../core/rating-cards";
import { askOrNothing, type EndTimer, startEndPoll } from "./end-poll";
import type { RatingHandlers } from "./rating-render";
import { createRatingSession } from "./rating-session";
import type { RatingView } from "./rating-view";
import { labelOf } from "./session-views";
import type { WorkerPort } from "./worker-port";

export type { EndTimer } from "./end-poll";

export type EndPorts = {
  port: Pick<WorkerPort, "askCard" | "rate" | "dismiss">;
  timer: EndTimer;
  show(view: RatingView, handlers: RatingHandlers): void;
  hide(): void;
};

export function createEndBlock(ports: EndPorts) {
  const seen = new Set<string>();
  const queue: ContentIds[] = [];
  const session = createRatingSession(ports, () => {
    openNext().catch(() => {});
  });

  function offer(ids: ContentIds, card: RatingCard, start?: number): void {
    if (session.isOpen()) {
      queue.push(ids);
      return;
    }
    const label = labelOf(card);
    if (label !== undefined) session.open(ids, card, label, start);
  }

  async function openNext(): Promise<void> {
    for (let ids = queue.shift(); ids !== undefined; ids = queue.shift()) {
      const answer = await askOrNothing(ports.port, ids);
      if (answer?.card && answer.card.pending.length > 0) {
        offer(ids, answer.card, answer.start);
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
      startEndPoll(
        ports.port,
        ports.timer,
        ids,
        (card, start) => offer(ids, card, start),
        () => seen.delete(key),
      );
    },
    isShown: (): boolean => session.isOpen(),
  };
}
