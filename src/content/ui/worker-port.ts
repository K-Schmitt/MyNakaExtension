// The block's line to the worker. The send function is injected (the entry binds chrome.runtime), so
// nothing here touches chrome.*. A send that fails gives `undefined`, never a throw; an answer is
// validated field by field (worker-answers) before the block uses it.

import type { ContentIds } from "../../core/finish-event";
import type { RatingLabel } from "../../core/rating-cards";
import {
  parseOpenQuestionsAnswer,
  parseRemovalOfferAnswer,
} from "../../ext/question-answer-schema";
import type { QuestionMessage } from "../../ext/question-messages";
import type { RatingMessage } from "../../ext/rating-messages";
import { parseCardAnswer, parseCardsAnswer } from "./worker-answers";

type PortMessage = RatingMessage | QuestionMessage;

export type SendRating = (msg: PortMessage) => Promise<unknown>;

function idsOf({ contentId, season, episode }: ContentIds): ContentIds {
  return {
    contentId,
    ...(season === undefined ? {} : { season }),
    ...(episode === undefined ? {} : { episode }),
  };
}

export type WorkerPort = ReturnType<typeof createWorkerPort>;

export function createWorkerPort(send: SendRating) {
  async function ask(msg: PortMessage): Promise<unknown> {
    try {
      return await send(msg);
    } catch {
      return undefined;
    }
  }

  // True when the send resolved, false when it rejected or threw: the answer itself is not read.
  async function sent(msg: PortMessage): Promise<boolean> {
    try {
      await send(msg);
      return true;
    } catch {
      return false;
    }
  }

  async function askChecked<T>(
    msg: PortMessage,
    parse: (raw: unknown) => T,
  ): Promise<T | undefined> {
    const raw = await ask(msg);
    try {
      return parse(raw);
    } catch {
      return undefined;
    }
  }

  return {
    askCard: (ids: ContentIds) =>
      askChecked({ type: "rating-card", ...idsOf(ids) }, (raw) =>
        parseCardAnswer(raw, ids),
      ),
    askCards: () => askChecked({ type: "rating-cards" }, parseCardsAnswer),
    askQuestions: () =>
      askChecked({ type: "open-questions" }, parseOpenQuestionsAnswer),
    askRemovalOffer: (contentId: number) =>
      askChecked({ type: "removal-offer", contentId }, parseRemovalOfferAnswer),
    rate: (ids: ContentIds, label: RatingLabel, rating: number) =>
      sent({ type: "rate", ...idsOf(ids), label, rating }),
    dismiss: (ids: ContentIds, label: RatingLabel) =>
      sent({ type: "dismiss-rating", ...idsOf(ids), label }),
  };
}
