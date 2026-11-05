// The question family of the router: the three read-only messages, answered outside the queue, and the
// answer queue B5a will feed. `answering` comes from the queue's memory, like the sending of the ratings.

import type { QuestionKey } from "../core/questions";
import type { QuestionMessage } from "../ext/question-messages";
import type { RatingCardMessage } from "../ext/rating-messages";
import { createAnswerQueue } from "./answer-queue";
import { answerRead, type Respond } from "./answer-read";
import type { Jobs } from "./jobs";
import type { CardAnswer } from "./rating-answers";

export type QuestionRoutes = {
  /** Answers one question message; true: `respond` is called later. */
  route(msg: QuestionMessage, respond: Respond): boolean;
  /** The card answer, plus the sending of the title's question (a title with no card only). */
  withQuestionSending(msg: RatingCardMessage, answer: CardAnswer): CardAnswer;
};

export function createQuestionRoutes(
  enqueue: (job: () => Promise<void>) => void,
  jobs: Jobs,
): QuestionRoutes {
  // B5a queues its answers here; until then nothing is waiting or running.
  const answers = createAnswerQueue<{ key: QuestionKey }>(
    enqueue,
    async () => undefined,
  );
  return {
    route(msg, respond) {
      const answering = answers.answering();
      switch (msg.type) {
        case "open-questions":
          answerRead(() => jobs.openQuestions(answering), respond);
          return true;
        case "removal-offer":
          answerRead(
            () => jobs.removalOffer(msg.contentId, answering),
            respond,
          );
          return true;
        case "page-lists":
          answerRead(() => jobs.pageLists(answering), respond);
          return true;
      }
    },
    withQuestionSending(msg, answer) {
      const key = `ambiguity:naka:${msg.contentId}`;
      if (answer.card !== null || !answers.answering().includes(key)) {
        return answer;
      }
      return { ...answer, questionSending: true };
    },
  };
}
