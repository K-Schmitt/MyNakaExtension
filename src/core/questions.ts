// The open questions of the stored state: how they are keyed, listed from a search, answered or closed.
// Pure: every function takes a state and returns the next one (undefined when the answer is refused).

import type { Pair } from "./list-diff";
import {
  markAsked,
  type PendingItem,
  type QuestionCandidate,
  resolvePending,
  type Side,
  type SyncState,
  samePair,
  settlePair,
  setUnlinked,
  upsertMapping,
} from "./state";
import type { Candidate } from "./title-match";

export const MAX_CANDIDATES = 20;

export type AmbiguityItem = Extract<PendingItem, { kind: "ambiguity" }>;
export type RemovalItem = Extract<PendingItem, { kind: "removal" }>;

/** "ambiguity:<side>:<id>" | "removal:<removeFrom>:<nakaId>:<scId>" | "link:<side>:<id>" */
export type QuestionKey = string;

const ID = "[1-9]\\d*";
export const QUESTION_KEY = new RegExp(
  `^(?:ambiguity:(?:naka|sc):${ID}|removal:(?:naka|sc):${ID}:${ID}|link:(?:naka|sc):${ID})$`,
);

export function questionKey(item: PendingItem): QuestionKey {
  if (item.kind === "removal") {
    return `removal:${item.removeFrom}:${item.pair.nakaId}:${item.pair.scId}`;
  }
  return `ambiguity:${item.side}:${item.id}`;
}

export function linkKey(side: Side, id: number): QuestionKey {
  return `link:${side}:${id}`;
}

function toCandidate(found: Candidate): QuestionCandidate {
  const { id, title, year, type, image } = found;
  return {
    id,
    title,
    ...(year === undefined ? {} : { year }),
    type,
    ...(image === undefined ? {} : { image }),
  };
}

// In the order of `ids` (the match's order), not of the search; an id the search did not list is skipped.
export function toCandidates(
  found: readonly Candidate[],
  ids: readonly number[],
): QuestionCandidate[] {
  const listed: QuestionCandidate[] = [];
  for (const id of ids) {
    const hit = found.find((c) => c.id === id);
    if (hit) listed.push(toCandidate(hit));
  }
  return listed.slice(0, MAX_CANDIDATES);
}

export function openAmbiguity(
  state: SyncState,
  side: Side,
  id: number,
): AmbiguityItem | undefined {
  for (const item of state.pending) {
    if (item.kind === "ambiguity" && item.side === side && item.id === id) {
      return item;
    }
  }
  return undefined;
}

export function findRemoval(
  state: SyncState,
  removeFrom: Side,
  pair: Pair,
): RemovalItem | undefined {
  for (const item of state.pending) {
    if (
      item.kind === "removal" &&
      item.removeFrom === removeFrom &&
      samePair(item.pair, pair)
    ) {
      return item;
    }
  }
  return undefined;
}

// Dismissed from the home row; the question stays on the page.
export function hideQuestion(state: SyncState, key: QuestionKey): SyncState {
  const item = state.pending.find((p) => questionKey(p) === key);
  if (!item) return state;
  if (item.kind === "removal") return markAsked(state, item.pair);
  const pending = state.pending.map((p) =>
    p === item ? { ...item, asked: true as const } : p,
  );
  return { ...state, pending };
}

// A settled {X, S} next to a new mapping {X', S} would make conflictedPairs skip both pairs forever.
export function heldBySettled(state: SyncState, pair: Pair): boolean {
  return state.settled.some(
    (held) =>
      (held.nakaId === pair.nakaId || held.scId === pair.scId) &&
      !samePair(held, pair),
  );
}

const pairOf = (side: Side, id: number, otherId: number): Pair =>
  side === "naka"
    ? { nakaId: id, scId: otherId }
    : { nakaId: otherId, scId: id };

export function chooseCandidate(
  state: SyncState,
  side: Side,
  id: number,
  otherId: number,
): SyncState | undefined {
  const question = openAmbiguity(state, side, id);
  if (!question?.candidateIds.includes(otherId)) return undefined;
  const pair = pairOf(side, id, otherId);
  if (heldBySettled(state, pair)) return undefined;
  return resolvePending(upsertMapping(state, pair), question);
}

// « Aucun de ceux-là » is never an unlinked entry (Plan 2): the question stays, with nothing to choose.
export function chooseNone(
  state: SyncState,
  side: Side,
  id: number,
): SyncState | undefined {
  const question = openAmbiguity(state, side, id);
  if (!question) return undefined;
  const none = { ...question, candidateIds: [], candidates: [] };
  const pending = state.pending.map((p) => (p === question ? none : p));
  return { ...state, pending };
}

export function closeRemoval(state: SyncState, pair: Pair): SyncState {
  const pending = state.pending.filter(
    (item) => !(item.kind === "removal" && samePair(item.pair, pair)),
  );
  return { ...state, pending };
}

export function keepPair(state: SyncState, pair: Pair): SyncState {
  return closeRemoval(settlePair(state, pair), pair);
}

function withoutUnlinked(state: SyncState, side: Side, id: number): SyncState {
  return setUnlinked(
    state,
    state.unlinked.filter((u) => !(u.side === side && u.id === id)),
  );
}

export function linkByHand(
  state: SyncState,
  side: Side,
  id: number,
  otherId: number,
): SyncState | undefined {
  const question = openAmbiguity(state, side, id);
  const unlinked = state.unlinked.some((u) => u.side === side && u.id === id);
  if (!question && !unlinked) return undefined;
  const pair = pairOf(side, id, otherId);
  if (heldBySettled(state, pair)) return undefined;
  const mapped = withoutUnlinked(upsertMapping(state, pair), side, id);
  return question ? resolvePending(mapped, question) : mapped;
}

export function dropLegacy(
  state: SyncState,
  side: Side,
  id: number,
): SyncState | undefined {
  const question = openAmbiguity(state, side, id);
  if (!question || question.candidates !== undefined) return undefined;
  return resolvePending(state, question);
}

export function withFinish(
  state: SyncState,
  nakaId: number,
  key: string,
): SyncState {
  const question = openAmbiguity(state, "naka", nakaId);
  if (!question) return state;
  const pending = state.pending.map((p) =>
    p === question ? { ...question, finish: key } : p,
  );
  return { ...state, pending };
}
