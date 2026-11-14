// The worker's answers to « Annuler » (fiche-undo) and « Retirer la note » (fiche-remove), read by the Naka
// tab and checked field by field like the other title page answers (fiche-answers). A partial undo names
// the steps done and the step that failed, so the tab can say what was not put back (spec §4).

import type { UndoStep } from "../core/fiche-undo";
import type { NotSentAnswer, OkAnswer } from "./fiche-answers";
import { asDateDone } from "./fiche-undo-schema";
import {
  asList,
  asOneOf,
  asRecord,
  fail,
  onlyKeys,
  valuesOf,
} from "./field-checks";
import type { JobError } from "./job-error";
import { asRating } from "./rating-schema";
import { ERROR_CODES } from "./run-record-schema";

/** Who puts the film back in « Ma liste »: the tab's click on Naka's button, the worker's client, or nobody. */
export type UndoMaListe = "tab" | "client" | "none";
/** A step the worker runs: never the refusal, which runs nothing. */
export type RunStep = Exclude<UndoStep, { kind: "refused-protected" }>;
export type UndoOkAnswer = { ok: true; maListe: UndoMaListe };
export type UndoPartialAnswer = {
  partial: { done: RunStep[]; failed: RunStep };
  error: JobError;
};
/** Refused with no write: a critique or recommendation to keep, the ten minutes gone, nothing to remove. */
export type UndoRefusedAnswer = { refused: "protected" | "expired" };
export type RemoveRefusedAnswer = { refused: "protected" | "unrated" };
export type UndoAnswer =
  | UndoOkAnswer
  | UndoPartialAnswer
  | UndoRefusedAnswer
  | NotSentAnswer;
export type RemoveAnswer = OkAnswer | RemoveRefusedAnswer | NotSentAnswer;

const MA_LISTE = valuesOf<UndoMaListe>({ tab: true, client: true, none: true });
const UNDO_REFUSALS = valuesOf<UndoRefusedAnswer["refused"]>({
  protected: true,
  expired: true,
});
const REMOVE_REFUSALS = valuesOf<RemoveRefusedAnswer["refused"]>({
  protected: true,
  unrated: true,
});
const BARE_KINDS = valuesOf<Exclude<RunStep["kind"], "rate" | "markDone">>({
  undone: true,
  markDoneWithoutDate: true,
  wish: true,
  maListe: true,
  localRestore: true,
});
const KINDS = valuesOf<RunStep["kind"]>({
  rate: true,
  markDone: true,
  undone: true,
  markDoneWithoutDate: true,
  wish: true,
  maListe: true,
  localRestore: true,
});
const RATE_STEP_KEYS = valuesOf<keyof Extract<RunStep, { kind: "rate" }>>({
  kind: true,
  rating: true,
});
const DATE_STEP_KEYS = valuesOf<keyof Extract<RunStep, { kind: "markDone" }>>({
  kind: true,
  date: true,
});
const BARE_STEP_KEYS = valuesOf<keyof Extract<RunStep, { kind: "wish" }>>({
  kind: true,
});
const OK_KEYS = valuesOf<keyof UndoOkAnswer>({ ok: true, maListe: true });
const PARTIAL_KEYS = valuesOf<keyof UndoPartialAnswer>({
  partial: true,
  error: true,
});
const STEPS_KEYS = valuesOf<keyof UndoPartialAnswer["partial"]>({
  done: true,
  failed: true,
});
const REFUSED_KEYS = valuesOf<keyof UndoRefusedAnswer>({ refused: true });
const ERROR_KEYS = valuesOf<keyof NotSentAnswer>({ error: true });
const REMOVE_OK_KEYS = valuesOf<keyof OkAnswer>({ ok: true });

function parseStep(raw: unknown, path: string): RunStep {
  const record = asRecord(raw, path);
  const kind = asOneOf(record.kind, KINDS, `${path}.kind`);
  if (kind === "rate") {
    onlyKeys(record, RATE_STEP_KEYS, path);
    return { kind, rating: asRating(record.rating, `${path}.rating`) };
  }
  if (kind === "markDone") {
    onlyKeys(record, DATE_STEP_KEYS, path);
    const date = asDateDone(record.date, `${path}.date`) ?? fail(path);
    return { kind, date };
  }
  onlyKeys(record, BARE_STEP_KEYS, path);
  return { kind: asOneOf(kind, BARE_KINDS, `${path}.kind`) };
}

function parsePartial(record: Record<string, unknown>): UndoPartialAnswer {
  onlyKeys(record, PARTIAL_KEYS, "answer");
  const steps = asRecord(record.partial, "partial");
  onlyKeys(steps, STEPS_KEYS, "partial");
  return {
    partial: {
      done: asList(steps.done, "partial.done", parseStep),
      failed: parseStep(steps.failed, "partial.failed"),
    },
    error: asOneOf(record.error, ERROR_CODES, "error"),
  };
}

function parseRefused<R extends string>(
  record: Record<string, unknown>,
  reasons: readonly R[],
): { refused: R } {
  onlyKeys(record, REFUSED_KEYS, "answer");
  return { refused: asOneOf(record.refused, reasons, "refused") };
}

function parseError(record: Record<string, unknown>): NotSentAnswer {
  onlyKeys(record, ERROR_KEYS, "answer");
  return { error: asOneOf(record.error, ERROR_CODES, "error") };
}

export function parseUndoAnswer(raw: unknown): UndoAnswer {
  const record = asRecord(raw, "answer");
  if (record.ok === true) {
    onlyKeys(record, OK_KEYS, "answer");
    return { ok: true, maListe: asOneOf(record.maListe, MA_LISTE, "maListe") };
  }
  if (record.partial !== undefined) return parsePartial(record);
  if (record.refused !== undefined) return parseRefused(record, UNDO_REFUSALS);
  return parseError(record);
}

export function parseRemoveAnswer(raw: unknown): RemoveAnswer {
  const record = asRecord(raw, "answer");
  if (record.ok === true) {
    onlyKeys(record, REMOVE_OK_KEYS, "answer");
    return { ok: true };
  }
  if (record.refused !== undefined) {
    return parseRefused(record, REMOVE_REFUSALS);
  }
  return parseError(record);
}
