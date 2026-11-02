import { normalizeTitle } from "./normalize-title";

export type MediaType = "film" | "serie";

export type Titled = {
  title: string;
  originalTitle?: string;
  year?: number;
  type: MediaType;
};

export type Candidate = Titled & { id: number };

export type MatchResult =
  | { kind: "match"; id: number }
  | { kind: "ambiguous"; ids: number[] }
  | { kind: "none" };

type Names = { title: string; originalTitle?: string };

function normalizedNames(entry: Names): Set<string> {
  const names = [entry.title, entry.originalTitle ?? ""].map(normalizeTitle);
  return new Set(names.filter((name) => name !== ""));
}

function sharesName(query: Titled, candidate: Candidate): boolean {
  const queryNames = normalizedNames(query);
  for (const name of normalizedNames(candidate)) {
    if (queryNames.has(name)) return true;
  }
  return false;
}

function titleEqualCandidates(
  query: Titled,
  candidates: readonly Candidate[],
): Candidate[] {
  return candidates.filter(
    (candidate) =>
      candidate.type === query.type && sharesName(query, candidate),
  );
}

function yearGap(query: Titled, candidate: Candidate): number {
  if (query.year === undefined || candidate.year === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(query.year - candidate.year);
}

function ambiguous(candidates: readonly Candidate[]): MatchResult {
  return { kind: "ambiguous", ids: candidates.map((c) => c.id) };
}

function matchByYear(
  query: Titled,
  candidates: readonly Candidate[],
): MatchResult {
  const exact = candidates.filter((c) => yearGap(query, c) === 0);
  const [onlyExact] = exact;
  if (exact.length === 1 && onlyExact) {
    return { kind: "match", id: onlyExact.id };
  }
  const near = candidates.filter((c) => yearGap(query, c) <= 1);
  const [onlyNear] = near;
  if (near.length === 1 && onlyNear) {
    return { kind: "match", id: onlyNear.id };
  }
  return ambiguous(candidates);
}

export function matchTitle(
  query: Titled,
  candidates: readonly Candidate[],
): MatchResult {
  const equal = titleEqualCandidates(query, candidates);
  if (equal.length === 0) return { kind: "none" };
  if (query.year === undefined) return ambiguous(equal);
  return matchByYear(query, equal);
}
