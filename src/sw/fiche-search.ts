// The search of an unlinked title page on SensCritique, with Naka's own item (never the page's words):
// its own universe only, the title then the original title (findCandidates), one slot of the SC limiter
// per search. Read-only.

import { nakaToTitled, scToCandidate } from "../core/adapt-titles";
import { findCandidates } from "../core/candidate-search";
import type { Candidate } from "../core/title-match";
import type { NakaItem } from "../naka/naka-client";
import { WISH_UNIVERSE } from "../sc/sc-queries";
import type { JobDeps } from "./job-deps";

export function searchFiche(
  deps: JobDeps,
  item: NakaItem,
): Promise<Candidate[]> {
  const universe =
    item.mediaType === "movie" ? WISH_UNIVERSE.film : WISH_UNIVERSE.serie;
  return findCandidates(async (q) => {
    const items = await deps.limiters.sc.run(() => deps.sc.search(q, universe));
    return items.flatMap((found) => scToCandidate(found) ?? []);
  }, nakaToTitled(item));
}
