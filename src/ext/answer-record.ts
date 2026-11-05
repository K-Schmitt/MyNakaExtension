// The outcome of the last answer the owner gave to a question: one record in the settings (D8). It is
// read from storage and, by the Naka tab and the status page, from the worker's answers.

import { QUESTION_KEY, type QuestionKey } from "../core/questions";
import {
  asInt,
  asOneOf,
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import type { JobError } from "./job-error";
import { ERROR_CODES } from "./run-record-schema";

/** `mismatch`: a link by hand between a film and a series. */
export type AnswerOutcome = "done" | "moot" | "refused" | "mismatch" | "failed";

/** `error` is present if and only if the outcome is "failed". */
export type LastAnswer = {
  seq: number;
  at: number;
  target: QuestionKey;
  outcome: AnswerOutcome;
  error?: JobError;
};

const OUTCOMES = valuesOf<AnswerOutcome>({
  done: true,
  moot: true,
  refused: true,
  mismatch: true,
  failed: true,
});
const KEYS = valuesOf<keyof LastAnswer>({
  seq: true,
  at: true,
  target: true,
  outcome: true,
  error: true,
});

export function parseQuestionKey(raw: unknown, path: string): QuestionKey {
  const key = asString(raw, path);
  return QUESTION_KEY.test(key) ? key : fail(path);
}

// The reason comes with a failure, and only with one.
function answerError(
  raw: unknown,
  outcome: AnswerOutcome,
  path: string,
): JobError | undefined {
  if (outcome === "failed") return asOneOf(raw, ERROR_CODES, path);
  return whenPresent(raw, () => fail(path));
}

export function parseLastAnswer(raw: unknown, path: string): LastAnswer {
  const record = asRecord(raw, path);
  onlyKeys(record, KEYS, path);
  const outcome = asOneOf(record.outcome, OUTCOMES, `${path}.outcome`);
  const error = answerError(record.error, outcome, `${path}.error`);
  return {
    seq: asInt(record.seq, 0, `${path}.seq`),
    at: asInt(record.at, 0, `${path}.at`),
    target: parseQuestionKey(record.target, `${path}.target`),
    outcome,
    ...(error === undefined ? {} : { error }),
  };
}
