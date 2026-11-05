// States holding questions, for the tests of the worker's question answers.

import type { Pair } from "../src/core/list-diff";
import {
  emptyState,
  type PendingItem,
  type QuestionCandidate,
  type SyncState,
} from "../src/core/state";
import { memoryStore } from "./sw-fakes";

export const cand = (id: number, title = `T${id}`): QuestionCandidate => ({
  id,
  title,
  year: 2000,
  type: "serie",
});

export function ambiguity(
  id: number,
  over: Partial<Extract<PendingItem, { kind: "ambiguity" }>> = {},
): PendingItem {
  return {
    kind: "ambiguity",
    side: "naka",
    id,
    title: `Titre ${id}`,
    candidateIds: [id * 10, id * 10 + 1],
    candidates: [cand(id * 10), cand(id * 10 + 1)],
    ...over,
  };
}

export function removal(
  removeFrom: "naka" | "sc",
  pair: Pair,
  over: Partial<Extract<PendingItem, { kind: "removal" }>> = {},
): PendingItem {
  return { kind: "removal", removeFrom, pair, asked: false, ...over };
}

export function stateWith(over: Partial<SyncState>): SyncState {
  return { ...emptyState(), ...over };
}

export async function storeWith(state: SyncState) {
  const { store, area } = memoryStore();
  await store.saveState(state);
  return { store, area };
}

// A state at run 5 where the pair {nakaId: 1, scId: 101} is mapped; `over` changes what was listed.
export function mappedAt5(over: Partial<SyncState> = {}): SyncState {
  return stateWith({
    run: 5,
    mapping: [{ nakaId: 1, scId: 101 }],
    presence: {
      naka: [{ id: 1, from: 1, to: 5 }],
      sc: [{ id: 101, from: 1, to: 5 }],
    },
    ...over,
  });
}
