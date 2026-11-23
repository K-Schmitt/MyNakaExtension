// Validates the one stored undo record (key ficheUndo). Absent, null or corrupt all read as no record:
// an undo is a convenience, so a bad value only drops it and never breaks the store.

import type {
  FicheUndo,
  UndoBefore,
  UndoLocal,
  UndoRole,
} from "../core/fiche-undo";
import { isIsoDate } from "../core/iso-date";
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
  whenPresent,
} from "./field-checks";
import { parseRatings } from "./rating-schema";
import { StoredStateError } from "./stored-error";

const MAX_RATING = 10;

const ROLES = valuesOf<UndoRole>({ film: true, série: true });
const RECORD_KEYS = valuesOf<keyof FicheUndo>({
  contentId: true,
  productId: true,
  role: true,
  at: true,
  before: true,
  local: true,
});
const LOCAL_KEYS = valuesOf<keyof UndoLocal>({
  handled: true,
  settled: true,
  cards: true,
});
const BEFORE_KEYS = valuesOf<keyof UndoBefore>({
  rating: true,
  isDone: true,
  dateDone: true,
  isWished: true,
  inMaListe: true,
  dejaVuOn: true,
});

function asRating(raw: unknown, path: string): number | null {
  if (raw === null) return null;
  const rating = asInt(raw, 1, path);
  return rating > MAX_RATING ? fail(path) : rating;
}

export function asDateDone(raw: unknown, path: string): string | null {
  if (raw === null) return null;
  const date = asString(raw, path);
  return isIsoDate(date) ? date : fail(path);
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
    // A record stored before 10c has no such key: unknown.
    dejaVuOn:
      whenPresent(before.dejaVuOn, (v) =>
        asNullableBoolean(v, "ficheUndo.before.dejaVuOn"),
      ) ?? null,
  };
}

function checkLocal(raw: unknown): UndoLocal {
  const local = asRecord(raw, "ficheUndo.local");
  onlyKeys(local, LOCAL_KEYS, "ficheUndo.local");
  return {
    handled: asBoolean(local.handled, "ficheUndo.local.handled"),
    settled: asBoolean(local.settled, "ficheUndo.local.settled"),
    cards:
      local.cards === undefined
        ? fail("ficheUndo.local.cards")
        : parseRatings(local.cards),
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
    local: checkLocal(record.local),
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
