// Validates the one stored undo record (key ficheUndo). Absent, null or corrupt all read as no record:
// an undo is a convenience, so a bad value only drops it and never breaks the store.

import type { FicheUndo, UndoBefore, UndoRole } from "../core/fiche-undo";
import {
  asBoolean,
  asId,
  asInt,
  asOneOf,
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
} from "./field-checks";
import { StoredStateError } from "./stored-error";

const MAX_RATING = 10;
const DATE_DONE = /^\d{4}-\d{2}-\d{2}$/;

const ROLES = valuesOf<UndoRole>({ film: true, série: true });
const RECORD_KEYS = valuesOf<keyof FicheUndo>({
  contentId: true,
  productId: true,
  role: true,
  at: true,
  before: true,
});
const BEFORE_KEYS = valuesOf<keyof UndoBefore>({
  rating: true,
  isDone: true,
  dateDone: true,
  isWished: true,
  inMaListe: true,
});

function asRating(raw: unknown, path: string): number | null {
  if (raw === null) return null;
  const rating = asInt(raw, 1, path);
  return rating > MAX_RATING ? fail(path) : rating;
}

function asDateDone(raw: unknown, path: string): string | null {
  if (raw === null) return null;
  const date = asString(raw, path);
  return DATE_DONE.test(date) ? date : fail(path);
}

function asNullableBoolean(raw: unknown, path: string): boolean | null {
  return raw === null ? null : asBoolean(raw, path);
}

function checkBefore(raw: unknown): UndoBefore {
  const before = asRecord(raw, "ficheUndo.before");
  onlyKeys(before, BEFORE_KEYS, "ficheUndo.before");
  return {
    rating: asRating(before.rating, "ficheUndo.before.rating"),
    isDone: asBoolean(before.isDone, "ficheUndo.before.isDone"),
    dateDone: asDateDone(before.dateDone, "ficheUndo.before.dateDone"),
    isWished: asBoolean(before.isWished, "ficheUndo.before.isWished"),
    inMaListe: asNullableBoolean(
      before.inMaListe,
      "ficheUndo.before.inMaListe",
    ),
  };
}

function checkFicheUndo(raw: unknown): FicheUndo {
  const record = asRecord(raw, "ficheUndo");
  onlyKeys(record, RECORD_KEYS, "ficheUndo");
  return {
    contentId: asId(record.contentId, "ficheUndo.contentId"),
    productId: asId(record.productId, "ficheUndo.productId"),
    role: asOneOf(record.role, ROLES, "ficheUndo.role"),
    at: asInt(record.at, 0, "ficheUndo.at"),
    before: checkBefore(record.before),
  };
}

export function parseFicheUndo(raw: unknown): FicheUndo | null {
  if (raw === undefined || raw === null) return null;
  try {
    return checkFicheUndo(raw);
  } catch (error) {
    if (error instanceof StoredStateError) return null;
    throw error;
  }
}
