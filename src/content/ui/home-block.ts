// The home block: on the Naka home page, a panel lists the cards still to rate. Each entry is its own
// rating session (lock after a choice, re-ask counted from the click, confirmation of a série, the
// unreachable line), so a locked entry never stops the others. The panel asks the worker once per
// arrival on a home path, and takes itself down on leaving it.

import type { ContentIds } from "../../core/finish-event";
import type { RatingCard, RatingLabel } from "../../core/rating-cards";
import type { CardsAnswer } from "../../sw/rating-answers";
import type { EndTimer } from "./end-poll";
import { entryAsker } from "./home-asker";
import { type HomeEntry, type HomeView, homeView } from "./home-view";
import type { RatingHandlers } from "./rating-render";
import { createRatingSession } from "./rating-session";
import type { WorkerPort } from "./worker-port";

// The owner's probe (2026-11-05): the pathname is "/" after login and after the Naka logo.
export const HOME_PATHS = ["/"];

export type HomeHandlers = {
  entry(key: string): RatingHandlers;
  onFold(): void;
};

export type HomePorts = {
  port: Pick<WorkerPort, "askCards" | "rate" | "dismiss">;
  timer: EndTimer;
  now(): number;
  show(view: HomeView, handlers: HomeHandlers): void;
  hide(): void;
};

type Slot = {
  entry: HomeEntry;
  session: ReturnType<typeof createRatingSession>;
  handlers?: RatingHandlers;
};

const NO_HANDLERS: RatingHandlers = {
  onChoose: () => {},
  onAction: () => {},
  onOther: () => {},
  onConfirm: () => {},
};

function idsOf({ contentId, season, episode }: RatingCard): ContentIds {
  return {
    contentId,
    ...(season === undefined ? {} : { season }),
    ...(episode === undefined ? {} : { episode }),
  };
}

// The panel asks for the first pending label; the answer lists only cards that have one.
const firstPending = (card: RatingCard): RatingLabel =>
  card.pending[0] as RatingLabel;

export function createHomeBlock(ports: HomePorts) {
  let onHome = false;
  let folded = false;
  let arrival = 0; // each arrival and each departure starts a new one: an older answer is dropped
  let slots: Slot[] = [];
  let opening = false;

  function draw(): void {
    if (opening) return;
    if (slots.length === 0) {
      ports.hide();
      return;
    }
    ports.show(
      homeView(
        slots.map((slot) => slot.entry),
        folded,
      ),
      {
        entry: (key) =>
          slots.find((slot) => slot.entry.card.key === key)?.handlers ??
          NO_HANDLERS,
        onFold: () => {
          folded = !folded;
          draw();
        },
      },
    );
  }

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
            draw();
          },
          hide: () => {},
        },
        () => {
          slots = slots.filter((s) => s !== slot);
          draw();
        },
        { absentIsDone: true },
      ),
    };
    return slot;
  }

  function open(cards: CardsAnswer["cards"]): void {
    opening = true;
    const shown = cards.filter(({ card }) => card.pending.length > 0);
    slots = shown.map(slotOf);
    shown.forEach(({ card, start, sending }, i) => {
      const session = slots[i]?.session;
      session?.open(idsOf(card), card, firstPending(card), { start, sending });
    });
    opening = false;
    draw();
  }

  async function arrive(mine: number): Promise<void> {
    const answer = await ports.port.askCards();
    if (arrival !== mine || answer === undefined) return;
    open(answer.cards);
  }

  function leave(): void {
    arrival += 1;
    const gone = slots;
    slots = [];
    for (const slot of gone) slot.session.closeShown();
    ports.hide();
  }

  return {
    route(pathname: string): void {
      const home = HOME_PATHS.includes(pathname);
      if (home === onHome) return;
      onHome = home;
      if (!home) {
        leave();
        return;
      }
      folded = false;
      arrival += 1;
      arrive(arrival).catch(() => {});
    },
  };
}
