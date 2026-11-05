// The question messages. The reads: the Naka tab asks for the open questions and the removal block of a
// title, the status page for its lists, all answered outside the queue. The answers: one trusted click of
// the owner on a block or on the page; queued, answered `{ ok: true }` at once, and verified by the worker
// against the stored state before anything is written.

import type { QuestionKey } from "../core/questions";
import type { Side } from "../core/state";
import { parseQuestionKey } from "./answer-record";
import { asBoolean, asId, asOneOf, valuesOf } from "./field-checks";
import type { SenderRole } from "./messages";

export type QuestionMessage =
  | { type: "open-questions" }
  | { type: "removal-offer"; contentId: number }
  | { type: "page-lists" }
  /** `choice` null: « Aucun de ceux-là ». */
  | { type: "answer-question"; side: Side; id: number; choice: number | null }
  | {
      type: "answer-removal";
      removeFrom: Side;
      nakaId: number;
      scId: number;
      remove: boolean;
    }
  | { type: "hide-question"; key: QuestionKey };

export type QuestionType = QuestionMessage["type"];
export type RemovalOfferMessage = Extract<
  QuestionMessage,
  { type: "removal-offer" }
>;
export type AnswerQuestionMessage = Extract<
  QuestionMessage,
  { type: "answer-question" }
>;
export type AnswerRemovalMessage = Extract<
  QuestionMessage,
  { type: "answer-removal" }
>;
export type HideQuestionMessage = Extract<
  QuestionMessage,
  { type: "hide-question" }
>;
export type AnswerMessage =
  | AnswerQuestionMessage
  | AnswerRemovalMessage
  | HideQuestionMessage;

/** Spread into the worker's type list (messages.ts). */
export const QUESTION_TYPE_FLAGS: Record<QuestionType, true> = {
  "open-questions": true,
  "removal-offer": true,
  "page-lists": true,
  "answer-question": true,
  "answer-removal": true,
  "hide-question": true,
};
const QUESTION_TYPES = valuesOf<QuestionType>(QUESTION_TYPE_FLAGS);
const SIDES = valuesOf<Side>({ naka: true, sc: true });

export const QUESTION_SENDERS: Record<QuestionType, readonly SenderRole[]> = {
  "open-questions": ["naka-tab"],
  "removal-offer": ["naka-tab"],
  "page-lists": ["status-page"],
  "answer-question": ["naka-tab", "status-page"],
  "answer-removal": ["naka-tab", "status-page"],
  "hide-question": ["naka-tab"],
};

export function isQuestionType(type: string): type is QuestionType {
  return QUESTION_TYPES.some((known) => known === type);
}

// null is « Aucun de ceux-là »; an absent choice is no answer at all.
function asChoice(raw: unknown): number | null {
  return raw === null ? null : asId(raw, "choice");
}

function parseAnswer(record: Record<string, unknown>): AnswerQuestionMessage {
  return {
    type: "answer-question",
    side: asOneOf(record.side, SIDES, "side"),
    id: asId(record.id, "id"),
    choice: asChoice(record.choice),
  };
}

function parseRemoval(record: Record<string, unknown>): AnswerRemovalMessage {
  return {
    type: "answer-removal",
    removeFrom: asOneOf(record.removeFrom, SIDES, "removeFrom"),
    nakaId: asId(record.nakaId, "nakaId"),
    scId: asId(record.scId, "scId"),
    remove: asBoolean(record.remove, "remove"),
  };
}

export function parseQuestionMessage(
  type: QuestionType,
  record: Record<string, unknown>,
): QuestionMessage {
  switch (type) {
    case "removal-offer":
      return { type, contentId: asId(record.contentId, "contentId") };
    case "answer-question":
      return parseAnswer(record);
    case "answer-removal":
      return parseRemoval(record);
    case "hide-question":
      return { type, key: parseQuestionKey(record.key, "key") };
    default:
      return { type };
  }
}
