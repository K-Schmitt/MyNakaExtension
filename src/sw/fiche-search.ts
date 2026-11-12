// The search of an unlinked title page on SensCritique: its own universe only, the title then the
// original title (findCandidates), one slot of the SC limiter per search. Read-only.

import { scToCandidate } from "../core/adapt-titles";
import { findCandidates } from "../core/candidate-search";
import type { Candidate, Titled } from "../core/title-match";
import type { FicheInfoMessage } from "../ext/fiche-messages";
import type { JobDeps } from "./job-deps";

export function ficheTitled(msg: FicheInfoMessage): Titled {
  const titled: Titled = {
    title: msg.title,
    type: msg.mediaType === "movie" ? "film" : "serie",
  };
  if (msg.originalTitle !== undefined) titled.originalTitle = msg.originalTitle;
  if (msg.year !== undefined) titled.year = msg.year;
  return titled;
}

export function searchFiche(
  deps: JobDeps,
  msg: FicheInfoMessage,
  titled: Titled,
): Promise<Candidate[]> {
  const universe = msg.mediaType === "movie" ? "movie" : "tvShow";
  return findCandidates(async (q) => {
    const items = await deps.limiters.sc.run(() => deps.sc.search(q, universe));
    return items.flatMap((item) => scToCandidate(item) ?? []);
  }, titled);
}
