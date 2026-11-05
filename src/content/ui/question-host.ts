// A question over the player, for the end and pause blocks: the question session, fed by the card
// answers of the title's own ids (the worker puts the question, its sending flag and its last outcome
// in the `rating-card` answer while the title has no card). A candidate answer may make the worker run
// the title's finish, which creates the card: the host then tells its owner (`linked`) to wait for it.

import type { ContentIds } from "../../core/finish-event";
import type { AmbiguityOffer } from "../../sw/question-offers";
import type { CardAnswer } from "../../sw/rating-answers";
import { askOrNothing } from "./end-poll";
import {
  createQuestionSession,
  type QuestionPorts,
  type QuestionState,
} from "./question-session";
import type { QuestionChoice } from "./question-view";
import type { WorkerPort } from "./worker-port";

export type HostPorts = {
  port: Pick<WorkerPort, "askCard" | "answerQuestion">;
  timer: QuestionPorts["timer"];
  now(): number;
  showQuestion: QuestionPorts["show"];
  hide(): void;
};

type Open = { ids: ContentIds; offer: AmbiguityOffer; chose: boolean };

function stateOf(answer: CardAnswer, offer: AmbiguityOffer): QuestionState {
  return {
    present: answer.question?.key === offer.key,
    sending: answer.questionSending === true,
    last: answer.lastAnswer,
  };
}

/** `onClosed(ids, linked)`: `linked` is true when a candidate was answered and the question is gone. */
export function createQuestionHost(
  ports: HostPorts,
  onClosed: (ids: ContentIds, linked: boolean) => void,
) {
  let open: Open | undefined;

  async function ask(): Promise<QuestionState | undefined> {
    if (open === undefined) return undefined;
    const answer = await askOrNothing(ports.port, open.ids);
    return answer === undefined ? undefined : stateOf(answer, open.offer);
  }

  function send(choice: QuestionChoice): Promise<boolean> {
    if (open === undefined) return Promise.resolve(false);
    if (choice.kind !== "candidate" && choice.kind !== "none") {
      return Promise.resolve(false);
    }
    open.chose = choice.kind === "candidate";
    const { side, id } = open.offer;
    return ports.port.answerQuestion(
      side,
      id,
      choice.kind === "candidate" ? choice.id : null,
    );
  }

  const session = createQuestionSession(
    {
      timer: ports.timer,
      now: ports.now,
      show: ports.showQuestion,
      hide: ports.hide,
      ask,
      send,
    },
    (how) => {
      const done = open;
      open = undefined;
      if (done !== undefined)
        onClosed(done.ids, how === "answered" && done.chose);
    },
  );

  return {
    open(ids: ContentIds, offer: AmbiguityOffer, answer: CardAnswer): void {
      open = { ids, offer, chose: false };
      session.open(offer, ["plus-tard"], answer.lastAnswer?.seq ?? 0);
    },
    closeShown: (): void => session.closeShown(),
    isOpen: (): boolean => session.isOpen(),
  };
}
