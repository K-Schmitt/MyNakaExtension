// Finds the SensCritique product of a finished Naka title: the stored mapping first, else a search.
// The search follows the resolver: the title, then the original title only when the title found no
// candidate, candidates deduplicated by id (first wins), then matchTitle (same type only).

import type { Pair } from "./list-diff";
import type { SyncState } from "./state";
import { type Candidate, matchTitle, type Titled } from "./title-match";

export type ScMatch =
  | { kind: "pair"; pair: Pair; isNew: boolean }
  | { kind: "needs-choice"; candidateIds: number[] }
  | { kind: "not-found" };

type Search = { searchSc(q: string): Promise<Candidate[]> };

function uniqueById(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Set<number>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

async function findCandidates(
  ports: Search,
  titled: Titled,
): Promise<Candidate[]> {
  const byTitle = await ports.searchSc(titled.title);
  if (byTitle.length > 0 || !titled.originalTitle) return uniqueById(byTitle);
  return uniqueById(await ports.searchSc(titled.originalTitle));
}

// The resolver's swap guard: a product already mapped is never taken over. The title itself is not
// mapped when a search runs (a mapping hit returns first), so any holder is another Naka title.
function isHeld(state: SyncState, scId: number): boolean {
  return state.mapping.some((pair) => pair.scId === scId);
}

export async function matchOnSc(
  state: SyncState,
  nakaId: number,
  titled: Titled,
  ports: Search,
): Promise<ScMatch> {
  const mapped = state.mapping.find((pair) => pair.nakaId === nakaId);
  if (mapped) return { kind: "pair", pair: mapped, isNew: false };
  const result = matchTitle(titled, await findCandidates(ports, titled));
  if (result.kind === "none") return { kind: "not-found" };
  if (result.kind === "ambiguous") {
    return { kind: "needs-choice", candidateIds: result.ids };
  }
  if (isHeld(state, result.id)) {
    return { kind: "needs-choice", candidateIds: [result.id] };
  }
  return { kind: "pair", pair: { nakaId, scId: result.id }, isNew: true };
}
