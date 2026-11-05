// The question entries of the home panel. Each one is its own question session (lock after a choice,
// re-ask counted from the click, the unreachable line), so a locked question never stops the others.
// « Écarter » hides the question from the panel; a removal sends `answer-removal` with its `removeFrom`,
// an ambiguity `answer-question`. Entries keep the worker's order.

import type { QuestionKey } from "../../core/questions";
import type { QuestionOffer } from "../../sw/question-offers";
import type { EndTimer } from "./end-poll";
import type { QuestionHandlers } from "./question-render";
import {
  createQuestionSession,
  type QuestionPorts,
  type QuestionState,
} from "./question-session";
import type { QuestionChoice, QuestionView } from "./question-view";
import type { WorkerPort } from "./worker-port";

export type QuestionSlotPorts = {
  port: Pick<
    WorkerPort,
    "askQuestions" | "answerQuestion" | "answerRemoval" | "hideQuestion"
  >;
  timer: EndTimer;
  now(): number;
};

type Slot = {
  offer: QuestionOffer;
  session: ReturnType<typeof createQuestionSession>;
  view?: QuestionView;
  handlers?: QuestionHandlers;
};

/** `redraw(key)`: the slot of that question drew itself. `left`: a slot closed and is gone from the list. */
export type SlotHooks = { redraw(key: QuestionKey): void; left(): void };

function sendOf(
  ports: QuestionSlotPorts,
  offer: QuestionOffer,
  choice: QuestionChoice,
): Promise<boolean> {
  if (offer.kind === "removal") {
    if (choice.kind !== "remove" && choice.kind !== "keep") {
      return Promise.resolve(false);
    }
    const { nakaId, scId } = offer.pair;
    return ports.port.answerRemoval(
      offer.removeFrom,
      nakaId,
      scId,
      choice.kind === "remove",
    );
  }
  if (choice.kind !== "candidate" && choice.kind !== "none") {
    return Promise.resolve(false);
  }
  const id = choice.kind === "candidate" ? choice.id : null;
  return ports.port.answerQuestion(offer.side, offer.id, id);
}

export function createQuestionSlots(
  ports: QuestionSlotPorts,
  hooks: SlotHooks,
) {
  let slots: Slot[] = [];

  function askerOf(key: QuestionKey): QuestionPorts["ask"] {
    return async (): Promise<QuestionState | undefined> => {
      const answer = await ports.port.askQuestions();
      if (answer === undefined) return undefined;
      return {
        present: answer.questions.some((q) => q.key === key),
        sending: answer.answering?.includes(key) === true,
        last: answer.lastAnswer,
      };
    };
  }

  function slotOf(offer: QuestionOffer): Slot {
    const slot: Slot = {
      offer,
      session: createQuestionSession(
        {
          timer: ports.timer,
          now: ports.now,
          show: (view, handlers) => {
            slot.view = view;
            slot.handlers = handlers;
            hooks.redraw(offer.key);
          },
          hide: () => {},
          ask: askerOf(offer.key),
          send: (choice) => sendOf(ports, offer, choice),
          dismiss: () => ports.port.hideQuestion(offer.key),
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
    /**
     * Opens one entry per offer; the baseline is the answer's last outcome, so an older one is not theirs.
     * A key the worker is still answering opens locked, as a rating entry that is being sent does.
     */
    open(
      offers: QuestionOffer[],
      baseline: number,
      answering: QuestionKey[] = [],
    ): void {
      slots = offers.map(slotOf);
      for (const slot of slots) {
        const sending = answering.includes(slot.offer.key);
        slot.session.open(slot.offer, ["ecarter"], baseline, sending);
      }
    },
    views: (): { key: QuestionKey; view: QuestionView }[] =>
      slots.flatMap(({ offer, view }) =>
        view === undefined ? [] : [{ key: offer.key, view }],
      ),
    handlersOf: (key: QuestionKey): QuestionHandlers | undefined =>
      slots.find((s) => s.offer.key === key)?.handlers,
    regrace(exceptKey?: QuestionKey): void {
      for (const slot of slots) {
        if (slot.offer.key !== exceptKey) slot.session.regrace();
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
