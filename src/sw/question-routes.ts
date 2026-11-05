// The question family of the router. The three reads are answered outside the queue. The answers go
// through the answer queue: at most one waiting job per key, the latest click wins. A dismissal has a key
// of its own (`hide:`), so that it never replaces a waiting answer. `answering` comes from the queue's
// memory, like the sending of the ratings, and lists the keys of answers only.

import { QUESTION_KEY, type QuestionKey } from "../core/questions";
import type { AnswerMessage, QuestionMessage } from "../ext/question-messages";
import type { RatingCardMessage } from "../ext/rating-messages";
import { ambiguityTarget } from "./answer-jobs";
import { createAnswerQueue } from "./answer-queue";
import { answerRead, type Respond } from "./answer-read";
import type { Jobs } from "./jobs";
import type { CardAnswer } from "./rating-answers";
import { removalTarget } from "./removal-job";

export type QuestionRoutes = {
  /** Answers one question message; true: `respond` is called later. */
  route(msg: QuestionMessage, respond: Respond): boolean;
  /** The card answer, plus the sending of the title's question (a title with no card only). */
  withQuestionSending(msg: RatingCardMessage, answer: CardAnswer): CardAnswer;
};

type Queued = { key: QuestionKey; msg: AnswerMessage };

/** The answer queue's key of a message: the question's key, or `hide:` and the question's key. */
export function queueKeyOf(msg: AnswerMessage): QuestionKey {
  switch (msg.type) {
    case "answer-question":
      return ambiguityTarget(msg);
    case "answer-removal":
      return removalTarget(msg);
    case "hide-question":
      return `hide:${msg.key}`;
  }
}

function runAnswer(jobs: Jobs, msg: AnswerMessage): Promise<void> {
  switch (msg.type) {
    case "answer-question":
      return jobs.answerQuestion(msg);
    case "answer-removal":
      return jobs.answerRemoval(msg);
    case "hide-question":
      return jobs.hideQuestion(msg);
  }
}

// The job is queued first: a responder that throws (its port already closed) does not stop it.
function acknowledge(respond: Respond): false {
  try {
    respond({ ok: true });
  } catch {
    // The answer runs all the same.
  }
  return false;
}

export function createQuestionRoutes(
  enqueue: (job: () => Promise<void>) => void,
  jobs: Jobs,
): QuestionRoutes {
  const queue = createAnswerQueue<Queued>(enqueue, ({ msg }) =>
    runAnswer(jobs, msg),
  );
  const answering = () => queue.answering().filter((k) => QUESTION_KEY.test(k));
  return {
    route(msg, respond) {
      switch (msg.type) {
        case "open-questions":
          answerRead(() => jobs.openQuestions(answering()), respond);
          return true;
        case "removal-offer":
          answerRead(
            () => jobs.removalOffer(msg.contentId, answering()),
            respond,
          );
          return true;
        case "page-lists":
          answerRead(() => jobs.pageLists(answering()), respond);
          return true;
        default:
          queue({ key: queueKeyOf(msg), msg });
          return acknowledge(respond);
      }
    },
    withQuestionSending(msg, answer) {
      const key = `ambiguity:naka:${msg.contentId}`;
      if (answer.card !== null || !answering().includes(key)) return answer;
      return { ...answer, questionSending: true };
    },
  };
}
