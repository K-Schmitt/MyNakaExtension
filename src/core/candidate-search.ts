// Searches the other site for the candidates of a title, the same way for the resolver and the finish
// handler: the title first, then the original title only when the title found no candidate and the original
// title differs (the same query twice finds the same nothing); the candidates are deduplicated by id (the first
// one wins).

import type { Candidate, Titled } from "./title-match";

export type Search = (q: string) => Promise<Candidate[]>;

function uniqueById(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Set<number>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

export async function findCandidates(
  search: Search,
  titled: Titled,
): Promise<Candidate[]> {
  const byTitle = await search(titled.title);
  const other = titled.originalTitle;
  if (byTitle.length > 0 || !other || other === titled.title) {
    return uniqueById(byTitle);
  }
  return uniqueById(await search(other));
}
