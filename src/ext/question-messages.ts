// The question messages. The reads: the Naka tab asks for the open questions and the removal block of a
// title, the status page for its lists, all answered outside the queue. The answers: one trusted click of
// the owner on a block or on the page; queued, answered `{ ok: true }` at once, and verified by the worker
// against the stored state before anything is written.

import type { QuestionKey } from "../core/questions";
import { checkQuery } from "../core/search-query";
import type { Side } from "../core/state";
import { parseQuestionKey } from "./answer-record";
import { asBoolean, asId, asOneOf, asString, valuesOf } from "./field-checks";
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
  | { type: "hide-question"; key: QuestionKey }
  /** The status page only. `side` is the item's side: the search runs on the other site. */
  | { type: "search-titles"; side: Side; query: string }
  /** The status page only: `otherId` is a search result the owner picked, checked by the worker. */
  | { type: "link-title"; side: Side; id: number; otherId: number }
  | { type: "requeue-question"; side: Side; id: number };

export type QuestionType = QuestionMessage["type"];
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
export type SearchTitlesMessage = Extract<
  QuestionMessage,
  { type: "search-titles" }
>;
export type LinkTitleMessage = Extract<QuestionMessage, { type: "link-title" }>;
export type RequeueQuestionMessage = Extract<
  QuestionMessage,
  { type: "requeue-question" }
>;
export type AnswerMessage =
  | AnswerQuestionMessage
  | AnswerRemovalMessage
  | HideQuestionMessage
  | LinkTitleMessage
  | RequeueQuestionMessage;

/** Spread into the worker's type list (messages.ts). */
export const QUESTION_TYPE_FLAGS: Record<QuestionType, true> = {
  "open-questions": true,
  "removal-offer": true,
  "page-lists": true,
  "answer-question": true,
  "answer-removal": true,
  "hide-question": true,
  "search-titles": true,
  "link-title": true,
  "requeue-question": true,
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
  "search-titles": ["status-page"],
  "link-title": ["status-page"],
  "requeue-question": ["status-page"],
};

export function isQuestionType(type: string): type is QuestionType {
  return QUESTION_TYPES.some((known) => known === type);
}

// null is « Aucun de ceux-là »; an absent choice is no answer at all.
function asChoice(raw: unknown): number | null {
  return raw === null ? null : asId(raw, "choice");
}

// The same check the Naka client runs, so that a query the worker accepts is one both sites can take.
function checkSearch(raw: unknown): string {
  return checkQuery(asString(raw, "query"));
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
    case "search-titles":
      return {
        type,
        side: asOneOf(record.side, SIDES, "side"),
        query: checkSearch(record.query),
      };
    case "link-title":
      return {
        type,
        side: asOneOf(record.side, SIDES, "side"),
        id: asId(record.id, "id"),
        otherId: asId(record.otherId, "otherId"),
      };
    case "requeue-question":
      return {
        type,
        side: asOneOf(record.side, SIDES, "side"),
        id: asId(record.id, "id"),
      };
    default:
      return { type };
  }
}
