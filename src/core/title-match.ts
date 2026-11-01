import { normalizeTitle } from "./normalize-title";

export type MediaType = "film" | "serie";

export type NakaTitle = {
  title: string;
  originalTitle?: string;
  year?: number;
  type: MediaType;
};

export type ScCandidate = {
  productId: number;
  title: string;
  originalTitle?: string;
  year?: number;
  type: MediaType;
};

export type MatchResult =
  | { kind: "match"; productId: number }
  | { kind: "ambiguous"; productIds: number[] }
  | { kind: "none" };

type Names = { title: string; originalTitle?: string };

function normalizedNames(entry: Names): Set<string> {
  const names = [entry.title, entry.originalTitle ?? ""].map(normalizeTitle);
  return new Set(names.filter((name) => name !== ""));
}

function sharesName(naka: NakaTitle, candidate: ScCandidate): boolean {
  const nakaNames = normalizedNames(naka);
  for (const name of normalizedNames(candidate)) {
    if (nakaNames.has(name)) return true;
  }
  return false;
}

function titleEqualCandidates(
  naka: NakaTitle,
  candidates: ScCandidate[],
): ScCandidate[] {
  return candidates.filter(
    (candidate) => candidate.type === naka.type && sharesName(naka, candidate),
  );
}

function yearGap(naka: NakaTitle, candidate: ScCandidate): number {
  if (naka.year === undefined || candidate.year === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(naka.year - candidate.year);
}

function ambiguous(candidates: ScCandidate[]): MatchResult {
  return { kind: "ambiguous", productIds: candidates.map((c) => c.productId) };
}

function matchByYear(naka: NakaTitle, candidates: ScCandidate[]): MatchResult {
  const exact = candidates.filter((c) => yearGap(naka, c) === 0);
  const [onlyExact] = exact;
  if (exact.length === 1 && onlyExact) {
    return { kind: "match", productId: onlyExact.productId };
  }
  const near = candidates.filter((c) => yearGap(naka, c) <= 1);
  const [onlyNear] = near;
  if (near.length === 1 && onlyNear) {
    return { kind: "match", productId: onlyNear.productId };
  }
  return ambiguous(candidates);
}

export function matchTitle(
  naka: NakaTitle,
  candidates: ScCandidate[],
): MatchResult {
  const equal = titleEqualCandidates(naka, candidates);
  if (equal.length === 0) return { kind: "none" };
  if (naka.year === undefined) return ambiguous(equal);
  return matchByYear(naka, equal);
}
