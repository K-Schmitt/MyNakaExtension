// The status page's search for an unlinked title (B6). `side` is the item's side, so the search runs on the
// OTHER site: for a Naka title, both SensCritique universes (no session needed, the limiter is the site's);
// for a SensCritique title, one Naka search through a tab (a read, so the next tab may be tried). Read-only
// and answered outside the queue (D9): it never saves. A failure is a fixed code, never the error's text.

import { toCandidates } from "../core/questions";
import type { QuestionCandidate } from "../core/state";
import type { Candidate } from "../core/title-match";
import type { JobError } from "../ext/job-error";
import type { SearchTitlesMessage } from "../ext/question-messages";
import { checkQuery } from "../naka/naka-input";
import { type JobDeps, jobNaka } from "./job-deps";
import { searchNakaCandidates, searchScBoth } from "./read-ports";
import { toJobError } from "./to-job-error";

export type SearchAnswer =
  | { candidates: QuestionCandidate[] }
  | { error: JobError };

function found(deps: JobDeps, { side, query }: SearchTitlesMessage) {
  const { limiters } = deps;
  const text = checkQuery(query);
  return side === "naka"
    ? searchScBoth(deps.sc, limiters.sc, text)
    : searchNakaCandidates(jobNaka(deps), limiters.naka, text);
}

// At most MAX_CANDIDATES, each product once, in the order the site gave them.
function listed(results: readonly Candidate[]): QuestionCandidate[] {
  const ids = [...new Set(results.map((result) => result.id))];
  return toCandidates(results, ids);
}

export async function answerSearch(
  deps: JobDeps,
  msg: SearchTitlesMessage,
): Promise<SearchAnswer> {
  try {
    return { candidates: listed(await found(deps, msg)) };
  } catch (error) {
    return { error: toJobError(error) };
  }
}
