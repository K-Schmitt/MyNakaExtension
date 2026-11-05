// The worker's answers to `open-questions` and `removal-offer`, checked key by key: an extra key anywhere
// makes the whole answer refused (the parsers throw, the port gives `undefined`).

import type { QuestionKey } from "../core/questions";
import type {
  OpenQuestionsAnswer,
  RemovalOffer,
  RemovalOfferAnswer,
} from "../sw/question-offers";
import {
  type LastAnswer,
  parseLastAnswer,
  parseQuestionKey,
} from "./answer-record";
import {
  asList,
  asRecord,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import { parseQuestionOffer } from "./question-offer-schema";

const MAX_OPEN = 20;
const MAX_ANSWERING = 50;
const OPEN_KEYS = valuesOf<keyof OpenQuestionsAnswer>({
  questions: true,
  answering: true,
  lastAnswer: true,
});
const REMOVAL_ANSWER_KEYS = valuesOf<keyof RemovalOfferAnswer>({
  offer: true,
  answering: true,
  lastAnswer: true,
});

function parseAnswering(raw: unknown): { answering?: QuestionKey[] } {
  const answering = whenPresent(raw, (v) =>
    asList(v, "answering", parseQuestionKey),
  );
  if (answering !== undefined && answering.length > MAX_ANSWERING) {
    return fail("answering");
  }
  return answering === undefined ? {} : { answering };
}

function parseLast(raw: unknown): { lastAnswer?: LastAnswer } {
  const lastAnswer = whenPresent(raw, (v) => parseLastAnswer(v, "lastAnswer"));
  return lastAnswer === undefined ? {} : { lastAnswer };
}

/** The answer to an `open-questions`. */
export function parseOpenQuestionsAnswer(raw: unknown): OpenQuestionsAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, OPEN_KEYS, "answer");
  const questions = asList(record.questions, "questions", parseQuestionOffer);
  if (questions.length > MAX_OPEN) return fail("questions");
  return {
    questions,
    ...parseAnswering(record.answering),
    ...parseLast(record.lastAnswer),
  };
}

function parseRemovalOffer(raw: unknown): RemovalOffer | null {
  if (raw === null) return null;
  const offer = parseQuestionOffer(raw, "offer");
  return offer.kind === "removal" ? offer : fail("offer.kind");
}

/** The answer to a `removal-offer`. */
export function parseRemovalOfferAnswer(raw: unknown): RemovalOfferAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, REMOVAL_ANSWER_KEYS, "answer");
  if (record.answering !== undefined && record.answering !== true) {
    return fail("answering");
  }
  return {
    offer: parseRemovalOffer(record.offer),
    ...(record.answering === true ? { answering: true as const } : {}),
    ...parseLast(record.lastAnswer),
  };
}
