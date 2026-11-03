// Finds the SensCritique product of a finished Naka title: the stored mapping first, else a search
// shared with the resolver (candidate-search.ts), then matchTitle (same type only).
// A question already put to the owner about the title (checked first, even before the mapping), or
// about the product a search finds, is never decided here: the owner's pending choice wins.

import { findCandidates } from "./candidate-search";
import type { Pair } from "./list-diff";
import type { PendingItem, SyncState } from "./state";
import { type Candidate, matchTitle, type Titled } from "./title-match";

export type ScMatch =
  | { kind: "pair"; pair: Pair; isNew: boolean }
  /** The owner must choose: a new Naka-side question is to be saved. */
  | { kind: "needs-choice"; candidateIds: number[] }
  /** The owner was already asked about this title: nothing changes. */
  | { kind: "asked"; candidateIds: number[] }
  | { kind: "not-found" };

type Side = "naka" | "sc";

type Search = { searchSc(q: string): Promise<Candidate[]> };

// The resolver's swap guard: a product already mapped is never taken over. The title itself is not
// mapped when a search runs (a mapping hit returns first), so any holder is another Naka title.
function isHeld(state: SyncState, scId: number): boolean {
  return state.mapping.some((pair) => pair.scId === scId);
}

function openQuestion(
  state: SyncState,
  side: Side,
  id: number,
): Extract<PendingItem, { kind: "ambiguity" }> | undefined {
  for (const item of state.pending) {
    if (item.kind === "ambiguity" && item.side === side && item.id === id) {
      return item;
    }
  }
  return undefined;
}

export async function matchOnSc(
  state: SyncState,
  nakaId: number,
  titled: Titled,
  ports: Search,
): Promise<ScMatch> {
  const asked = openQuestion(state, "naka", nakaId);
  if (asked) return { kind: "asked", candidateIds: [...asked.candidateIds] };
  const mapped = state.mapping.find((pair) => pair.nakaId === nakaId);
  if (mapped) return { kind: "pair", pair: mapped, isNew: false };
  const candidates = await findCandidates((q) => ports.searchSc(q), titled);
  const result = matchTitle(titled, candidates);
  if (result.kind === "none") return { kind: "not-found" };
  if (result.kind === "ambiguous") {
    return { kind: "needs-choice", candidateIds: result.ids };
  }
  if (isHeld(state, result.id) || openQuestion(state, "sc", result.id)) {
    return { kind: "needs-choice", candidateIds: [result.id] };
  }
  return { kind: "pair", pair: { nakaId, scId: result.id }, isNew: true };
}
