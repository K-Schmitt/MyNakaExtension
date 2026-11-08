// The home block: on the Naka home page, a row « À traiter » lists the cards still to rate and the open
// questions. Each entry is its own session (lock after a choice, re-ask counted from the click,
// confirmation of a série, the unreachable line), so a locked entry never stops the others. The row asks
// the worker once per arrival on a home path, and takes itself down on leaving it or when its last entry
// is gone. When an entry leaves, the entries after it slide under the cursor: each remaining one, rating
// or question, gets a fresh click grace from that redraw.

import type { QuestionKey } from "../../core/questions";
import type { QuestionOffer } from "../../sw/question-offers";
import type { CardsAnswer } from "../../sw/rating-answers";
import type { EndTimer } from "./end-poll";
import { createQuestionSlots } from "./home-question-slots";
import { createRatingSlots } from "./home-rating-slots";
import { type HomeView, homeView } from "./home-view";
import { NO_HANDLERS, NO_QUESTION_HANDLERS } from "./idle-handlers";
import { titledOffer } from "./offer-title";
import type { QuestionHandlers } from "./question-render";
import type { QuestionView } from "./question-view";
import type { RatingHandlers } from "./rating-render";
import type { WorkerPort } from "./worker-port";

// The owner's probe (2026-11-05): the pathname is "/" after login and after the Naka logo.
export const HOME_PATHS = ["/"];

export type HomeHandlers = {
  entry(key: string): RatingHandlers;
  question(key: QuestionKey): QuestionHandlers;
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

export function createHomeBlock(ports: HomePorts) {
  let onHome = false;
  let arrival = 0; // each arrival and each departure starts a new one: an older answer is dropped
  let opening = false;
  let live: { key: QuestionKey; view: QuestionView } | undefined;
  let liveHandlers: QuestionHandlers | undefined;
  const ratings = createRatingSlots(ports, {
    redraw: (key) => redrawn(key, undefined),
    left: () => moved(),
  });
  const questions = createQuestionSlots(ports, {
    redraw: (key) => redrawn(undefined, key),
    left: () => moved(),
  });

  // An entry drew itself (a lock, an unlock, a failure line, the confirmation view): its size changed and
  // may have shifted the others under the cursor. Each other entry, rating or question, gets a fresh
  // grace from this redraw.
  function redrawn(rating?: string, question?: QuestionKey): void {
    if (!opening) {
      ratings.regrace(rating);
      questions.regrace(question);
    }
    draw();
  }

  function draw(): void {
    if (opening) return;
    const asked = questions.views();
    if (ratings.count() === 0 && asked.length === 0 && live === undefined) {
      ports.hide();
      return;
    }
    ports.show(homeView(ratings.entries(), asked, live), {
      question: (key) =>
        (key === live?.key ? liveHandlers : questions.handlersOf(key)) ??
        NO_QUESTION_HANDLERS,
      entry: (key) => ratings.handlersOf(key) ?? NO_HANDLERS,
    });
  }

  // An entry left: the ones after it slid into its place, so each gets a fresh grace from this redraw.
  function moved(): void {
    ratings.regrace();
    questions.regrace();
    draw();
  }

  function open(
    cards: CardsAnswer["cards"],
    offers: QuestionOffer[],
    baseline: number,
    answering: QuestionKey[],
  ): void {
    opening = true;
    ratings.open(cards);
    questions.open(offers, baseline, answering);
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
      (asked?.questions ?? []).map((q) =>
        titledOffer(ports.titleOf, ports.timer, q),
      ),
    );
    if (arrival !== mine || (cards === undefined && asked === undefined)) {
      return;
    }
    open(
      cards?.cards ?? [],
      offers,
      asked?.lastAnswer?.seq ?? 0,
      asked?.answering ?? [],
    );
  }

  function leave(): void {
    arrival += 1;
    live = undefined;
    liveHandlers = undefined;
    ratings.closeAll();
    questions.closeAll();
    ports.hide();
  }

  return {
    isHome: (): boolean => onHome,
    /** The removal offer just made on this page: the row's first card, until it closes. */
    showLive(
      key: QuestionKey,
      view: QuestionView,
      handlers: QuestionHandlers,
    ): void {
      live = { key, view };
      liveHandlers = handlers;
      moved();
    },
    hideLive(): void {
      live = undefined;
      liveHandlers = undefined;
      moved();
    },
    route(pathname: string): void {
      const home = HOME_PATHS.includes(pathname);
      if (home === onHome) return;
      onHome = home;
      if (!home) {
        leave();
        return;
      }
      arrival += 1;
      arrive(arrival).catch(() => {});
    },
  };
}
