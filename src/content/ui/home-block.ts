// The home block: on the Naka home page, a panel lists the cards still to rate (« À noter ») and the open
// questions (« Questions »). Each entry is its own session (lock after a choice, re-ask counted from the
// click, confirmation of a série, the unreachable line), so a locked entry never stops the others. The
// panel asks the worker once per arrival on a home path, and takes itself down on leaving it. When an
// entry leaves, the entries under it move up under the cursor: each remaining one, rating or question,
// gets a fresh click grace from that redraw.

import type { ContentIds } from "../../core/finish-event";
import type { QuestionKey } from "../../core/questions";
import type { RatingCard } from "../../core/rating-cards";
import type { QuestionOffer } from "../../sw/question-offers";
import type { CardsAnswer } from "../../sw/rating-answers";
import type { EndTimer } from "./end-poll";
import { entryAsker } from "./home-asker";
import { createQuestionSlots } from "./home-question-slots";
import { type HomeEntry, type HomeView, homeView } from "./home-view";
import { NO_HANDLERS, NO_QUESTION_HANDLERS } from "./idle-handlers";
import { titledOffer } from "./offer-title";
import type { QuestionHandlers } from "./question-render";
import type { RatingHandlers } from "./rating-render";
import { createRatingSession } from "./rating-session";
import { labelOf } from "./session-views";
import type { WorkerPort } from "./worker-port";

// The owner's probe (2026-11-05): the pathname is "/" after login and after the Naka logo.
export const HOME_PATHS = ["/"];

export type HomeHandlers = {
  entry(key: string): RatingHandlers;
  question(key: QuestionKey): QuestionHandlers;
  onFold(): void;
};

export type HomePorts = {
  port: Pick<
    WorkerPort,
    | "askCards"
    | "askQuestions"
    | "rate"
    | "dismiss"
    | "answerQuestion"
    | "answerRemoval"
    | "hideQuestion"
  >;
  titleOf(contentId: number): Promise<string | undefined>;
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

function idsOf({ contentId, season, episode }: RatingCard): ContentIds {
  return {
    contentId,
    ...(season === undefined ? {} : { season }),
    ...(episode === undefined ? {} : { episode }),
  };
}

export function createHomeBlock(ports: HomePorts) {
  let onHome = false;
  let folded = false;
  let arrival = 0; // each arrival and each departure starts a new one: an older answer is dropped
  let slots: Slot[] = [];
  let opening = false;
  const questions = createQuestionSlots(ports, {
    redraw: () => draw(),
    left: () => moved(),
  });

  function draw(): void {
    if (opening) return;
    const asked = questions.views();
    if (slots.length === 0 && asked.length === 0) {
      ports.hide();
      return;
    }
    ports.show(
      homeView(
        slots.map((slot) => slot.entry),
        folded,
        asked,
      ),
      {
        question: (key) => questions.handlersOf(key) ?? NO_QUESTION_HANDLERS,
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

  // An entry left: the ones under it moved up, so each gets a fresh grace from this redraw.
  function moved(): void {
    for (const slot of slots) slot.session.regrace();
    questions.regrace();
    draw();
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
          moved();
        },
        { absentIsDone: true },
      ),
    };
    return slot;
  }

  function open(
    cards: CardsAnswer["cards"],
    offers: QuestionOffer[],
    baseline: number,
  ): void {
    opening = true;
    const shown = cards.filter(({ card }) => card.pending.length > 0);
    slots = shown.map(slotOf);
    // Each entry opens on its failed label, else its first pending one (the list holds only cards with one).
    shown.forEach(({ card, start, sending }, i) => {
      const session = slots[i]?.session;
      const label = labelOf(card);
      if (label !== undefined) {
        session?.open(idsOf(card), card, label, { start, sending });
      }
    });
    questions.open(offers, baseline);
    opening = false;
    draw();
  }

  // Cards and questions are asked together; one that does not answer leaves the other's part alone.
  async function arrive(mine: number): Promise<void> {
    const [cards, asked] = await Promise.all([
      ports.port.askCards(),
      ports.port.askQuestions(),
    ]);
    const offers = await Promise.all(
      (asked?.questions ?? []).map((q) => titledOffer(ports.titleOf, q)),
    );
    if (arrival !== mine || (cards === undefined && asked === undefined)) {
      return;
    }
    open(cards?.cards ?? [], offers, asked?.lastAnswer?.seq ?? 0);
  }

  function leave(): void {
    arrival += 1;
    const gone = slots;
    slots = [];
    for (const slot of gone) slot.session.closeShown();
    questions.closeAll();
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
