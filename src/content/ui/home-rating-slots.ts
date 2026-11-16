// The rating entries of the home row. Each one is its own rating session (lock after a choice, re-ask
// counted from the click, confirmation of a série, the unreachable line), so a locked entry never stops
// the others. A card missing from the worker's list has nothing left to ask (`absentIsDone`).

import { idsOf } from "../../core/finish-event";
import type { RatingCard } from "../../core/rating-cards";
import type { CardsAnswer } from "../../sw/rating-answers";
import type { EndTimer } from "./end-poll";
import { entryAsker } from "./home-asker";
import type { HomeEntry } from "./home-view";
import type { RatingHandlers } from "./rating-render";
import { createRatingSession } from "./rating-session";
import { labelOf } from "./session-views";
import type { WorkerPort } from "./worker-port";

export type RatingSlotPorts = {
  port: Pick<WorkerPort, "askCards" | "rate" | "dismiss">;
  timer: EndTimer;
  now(): number;
};

type Slot = {
  entry: HomeEntry;
  session: ReturnType<typeof createRatingSession>;
  handlers?: RatingHandlers;
};

/** `redraw(key)`: the entry of that card drew itself. `left`: an entry closed and is gone from the list. */
export type RatingSlotHooks = { redraw(key: string): void; left(): void };

export function createRatingSlots(
  ports: RatingSlotPorts,
  hooks: RatingSlotHooks,
) {
  let slots: Slot[] = [];

  function slotOf({ card, start }: { card: RatingCard; start?: number }): Slot {
    const key = card.key;
    const slot: Slot = {
      entry: { card, ...(start === undefined ? {} : { start }) },
      session: createRatingSession(
        {
          port: {
            askCard: entryAsker(ports.port, key),
            rate: (ids, label, rating) => ports.port.rate(ids, label, rating),
            dismiss: (ids, label) => ports.port.dismiss(ids, label),
          },
          timer: ports.timer,
          now: ports.now,
          show: (view, handlers) => {
            slot.entry = { ...slot.entry, view };
            slot.handlers = handlers;
            hooks.redraw(key);
          },
          hide: () => {},
        },
        () => {
          slots = slots.filter((s) => s !== slot);
          hooks.left();
        },
        { absentIsDone: true },
      ),
    };
    return slot;
  }

  return {
    /** Each entry opens on its failed label, else its first pending one (the list holds only cards with one). */
    open(cards: CardsAnswer["cards"]): void {
      const shown = cards.filter(({ card }) => card.pending.length > 0);
      slots = shown.map(slotOf);
      shown.forEach(({ card, start, sending }, i) => {
        const label = labelOf(card);
        if (label !== undefined) {
          slots[i]?.session.open(idsOf(card), card, label, { start, sending });
        }
      });
    },
    entries: (): HomeEntry[] => slots.map((slot) => slot.entry),
    handlersOf: (key: string): RatingHandlers | undefined =>
      slots.find((slot) => slot.entry.card.key === key)?.handlers,
    regrace(exceptKey?: string): void {
      for (const slot of slots) {
        if (slot.entry.card.key !== exceptKey) slot.session.regrace();
      }
    },
    count: (): number => slots.length,
    closeAll(): void {
      const gone = slots;
      slots = [];
      for (const slot of gone) slot.session.closeShown();
    },
  };
}
