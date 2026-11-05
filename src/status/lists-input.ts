// The worker's answers to `page-lists` and `search-titles`, checked before the page reads them. They come
// from our own worker but are treated as untrusted: a fresh object holding the known keys, or undefined.
// Never throws.

import type { QuestionCandidate } from "../core/state";
import { parseOfferCandidates } from "../ext/candidate-schema";
import {
  asList,
  asOneOf,
  asRecord,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "../ext/field-checks";
import type { JobError } from "../ext/job-error";
import {
  parseLastAnswer,
  parsePageQuestion,
  parseQuestionKey,
  parseUnlinkedOffer,
} from "../ext/question-offer-schema";
import { ERROR_CODES } from "../ext/run-record-schema";
import type { PageListsAnswer } from "../sw/question-offers";

const MAX_ROWS = 200;
const LIST_KEYS = valuesOf<keyof PageListsAnswer>({
  questions: true,
  unlinked: true,
  answering: true,
  lastAnswer: true,
});

function bounded<T>(rows: T[], path: string): T[] {
  return rows.length > MAX_ROWS ? fail(path) : rows;
}

function parseLists(raw: unknown): PageListsAnswer {
  const record = asRecord(raw, "answer");
  onlyKeys(record, LIST_KEYS, "answer");
  const answering = whenPresent(record.answering, (v) =>
    bounded(asList(v, "answering", parseQuestionKey), "answering"),
  );
  const lastAnswer = whenPresent(record.lastAnswer, (v) =>
    parseLastAnswer(v, "lastAnswer"),
  );
  return {
    questions: bounded(
      asList(record.questions, "questions", parsePageQuestion),
      "questions",
    ),
    unlinked: bounded(
      asList(record.unlinked, "unlinked", parseUnlinkedOffer),
      "unlinked",
    ),
    ...(answering === undefined ? {} : { answering }),
    ...(lastAnswer === undefined ? {} : { lastAnswer }),
  };
}

export function readLists(raw: unknown): PageListsAnswer | undefined {
  try {
    return parseLists(raw);
  } catch {
    return undefined;
  }
}

export type SearchReply =
  | { candidates: QuestionCandidate[] }
  | { error: JobError };

function parseSearch(raw: unknown): SearchReply {
  const record = asRecord(raw, "answer");
  if (record.error !== undefined) {
    onlyKeys(record, ["error"], "answer");
    return { error: asOneOf(record.error, ERROR_CODES, "error") };
  }
  onlyKeys(record, ["candidates"], "answer");
  return { candidates: parseOfferCandidates(record.candidates, "candidates") };
}

export function readSearch(raw: unknown): SearchReply | undefined {
  try {
    return parseSearch(raw);
  } catch {
    return undefined;
  }
}
