import { MAX_CANDIDATES } from "../core/questions";
import type { QuestionCandidate } from "../core/state";
import type { MediaType } from "../core/title-match";
import { MAX_YEAR, MIN_YEAR } from "../core/year-range";
import {
  asId,
  asInt,
  asList,
  asOneOf,
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import { optionalImage } from "./image-schema";

const TYPES = valuesOf<MediaType>({ film: true, serie: true });
const CANDIDATE_KEYS = valuesOf<keyof QuestionCandidate>({
  id: true,
  title: true,
  year: true,
  type: true,
  image: true,
});

function asYear(raw: unknown, path: string): number {
  const year = asInt(raw, MIN_YEAR, path);
  return year > MAX_YEAR ? fail(path) : year;
}

function parseCandidate(raw: unknown, path: string): QuestionCandidate {
  const record = asRecord(raw, path);
  onlyKeys(record, CANDIDATE_KEYS, path);
  const year = whenPresent(record.year, (v) => asYear(v, `${path}.year`));
  return {
    id: asId(record.id, `${path}.id`),
    title: asString(record.title, `${path}.title`),
    ...(year === undefined ? {} : { year }),
    type: asOneOf(record.type, TYPES, `${path}.type`),
    ...optionalImage(record, path),
  };
}

// At most MAX_CANDIDATES, and exactly the ids of `candidateIds`, in order.
export function parseCandidates(
  raw: unknown,
  candidateIds: readonly number[],
  path: string,
): QuestionCandidate[] {
  const candidates = asList(raw, path, parseCandidate);
  const sameIds =
    candidates.length === candidateIds.length &&
    candidates.every((c, i) => c.id === candidateIds[i]);
  if (candidates.length > MAX_CANDIDATES || !sameIds) return fail(path);
  return candidates;
}

// The candidates of an offer the worker answered: at most MAX_CANDIDATES, with no ids list to match.
export function parseOfferCandidates(
  raw: unknown,
  path: string,
): QuestionCandidate[] {
  const candidates = asList(raw, path, parseCandidate);
  return candidates.length > MAX_CANDIDATES ? fail(path) : candidates;
}
