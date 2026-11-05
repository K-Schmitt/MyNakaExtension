// The question messages: the Naka tab asks for the open questions and the removal block of a title, the
// status page for its lists. All three are read-only, answered outside the queue.

import { asId, valuesOf } from "./field-checks";
import type { SenderRole } from "./messages";

export type QuestionMessage =
  | { type: "open-questions" }
  | { type: "removal-offer"; contentId: number }
  | { type: "page-lists" };

export type QuestionType = QuestionMessage["type"];
export type RemovalOfferMessage = Extract<
  QuestionMessage,
  { type: "removal-offer" }
>;

const QUESTION_TYPES = valuesOf<QuestionType>({
  "open-questions": true,
  "removal-offer": true,
  "page-lists": true,
});

export const QUESTION_SENDERS: Record<QuestionType, readonly SenderRole[]> = {
  "open-questions": ["naka-tab"],
  "removal-offer": ["naka-tab"],
  "page-lists": ["status-page"],
};

export function isQuestionType(type: string): type is QuestionType {
  return QUESTION_TYPES.some((known) => known === type);
}

export function parseQuestionMessage(
  type: QuestionType,
  record: Record<string, unknown>,
): QuestionMessage {
  if (type === "removal-offer") {
    return { type, contentId: asId(record.contentId, "contentId") };
  }
  return { type };
}
