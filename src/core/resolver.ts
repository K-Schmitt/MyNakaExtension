import { findCandidates } from "./candidate-search";
import type { Pair } from "./list-diff";
import { type AmbiguityItem, toCandidates } from "./questions";
import {
  addPending,
  type SyncState,
  setUnlinked,
  type UnlinkedItem,
  upsertMapping,
} from "./state";
import { type Candidate, matchTitle, type Titled } from "./title-match";

export type ResolverPorts = {
  describeNaka(id: number): Promise<Titled | undefined>;
  searchNaka(q: string): Promise<Candidate[]>;
  describeSc(id: number): Promise<Titled | undefined>;
  searchSc(q: string): Promise<Candidate[]>;
};

type Side = "naka" | "sc";

type Direction = {
  side: Side;
  describe(id: number): Promise<Titled | undefined>;
  search(q: string): Promise<Candidate[]>;
  own(pair: Pair): number;
  other(pair: Pair): number;
  pairOf(own: number, other: number): Pair;
};

type Outcome =
  | { kind: "state"; state: SyncState }
  | { kind: "unlinked"; item: UnlinkedItem };

function nakaDirection(ports: ResolverPorts): Direction {
  return {
    side: "naka",
    describe: (id) => ports.describeNaka(id),
    search: (q) => ports.searchSc(q),
    own: (pair) => pair.nakaId,
    other: (pair) => pair.scId,
    pairOf: (own, other) => ({ nakaId: own, scId: other }),
  };
}

function scDirection(ports: ResolverPorts): Direction {
  return {
    side: "sc",
    describe: (id) => ports.describeSc(id),
    search: (q) => ports.searchNaka(q),
    own: (pair) => pair.scId,
    other: (pair) => pair.nakaId,
    pairOf: (own, other) => ({ nakaId: other, scId: own }),
  };
}

const otherSide = (side: Side): Side => (side === "naka" ? "sc" : "naka");

function isAsked(state: SyncState, side: Side, id: number): boolean {
  return state.pending.some(
    (item) => item.kind === "ambiguity" && item.side === side && item.id === id,
  );
}

function isSettled(state: SyncState, dir: Direction, id: number): boolean {
  const mapped = state.mapping.some((pair) => dir.own(pair) === id);
  const asked = isAsked(state, dir.side, id);
  const unlinked = state.unlinked.some(
    (item) => item.side === dir.side && item.id === id,
  );
  return mapped || asked || unlinked;
}

// The question keeps the asked title and what the search listed, so that showing it needs no network
// read. Its candidateIds are those of the stored candidates (the list is capped, the match's ids are not).
function questionOf(
  dir: Direction,
  id: number,
  titled: Titled,
  found: readonly Candidate[],
  ids: readonly number[],
): AmbiguityItem {
  const candidates = toCandidates(found, ids);
  return {
    kind: "ambiguity",
    side: dir.side,
    id,
    candidateIds: candidates.map((c) => c.id),
    title: titled.title,
    candidates,
  };
}

// The owner decides, and the mapping is unchanged, when the match is held by another title (the swap
// guard) or when the owner is still asked about the match on its own side: a question left open by
// one direction of the sync is never decided by the other.
function mapOrAsk(
  state: SyncState,
  dir: Direction,
  asked: { id: number; titled: Titled; found: readonly Candidate[] },
  otherId: number,
): SyncState {
  const { id, titled, found } = asked;
  const heldByAnother = state.mapping.some(
    (pair) => dir.other(pair) === otherId,
  );
  const askedAboutOther = isAsked(state, otherSide(dir.side), otherId);
  if (heldByAnother || askedAboutOther) {
    return addPending(state, questionOf(dir, id, titled, found, [otherId]));
  }
  return upsertMapping(state, dir.pairOf(id, otherId));
}

async function resolveOne(
  state: SyncState,
  dir: Direction,
  id: number,
): Promise<Outcome> {
  const titled = await dir.describe(id);
  if (!titled) {
    const item = {
      side: dir.side,
      id,
      title: "",
      reason: "not-in-catalogue",
    } as const;
    return { kind: "unlinked", item };
  }
  const candidates = await findCandidates((q) => dir.search(q), titled);
  const result = matchTitle(titled, candidates);
  if (result.kind === "match") {
    const asked = { id, titled, found: candidates };
    return { kind: "state", state: mapOrAsk(state, dir, asked, result.id) };
  }
  if (result.kind === "ambiguous") {
    const item = questionOf(dir, id, titled, candidates, result.ids);
    return { kind: "state", state: addPending(state, item) };
  }
  const item = {
    side: dir.side,
    id,
    title: titled.title,
    reason: "no-match",
  } as const;
  return { kind: "unlinked", item };
}

async function attempt(
  state: SyncState,
  dir: Direction,
  id: number,
): Promise<Outcome | undefined> {
  try {
    return await resolveOne(state, dir, id);
  } catch {
    return undefined;
  }
}

async function resolveIds(
  ids: readonly number[],
  state: SyncState,
  dir: Direction,
): Promise<SyncState> {
  let current = state;
  const added: UnlinkedItem[] = [];
  for (const id of new Set(ids)) {
    if (isSettled(current, dir, id)) continue;
    const outcome = await attempt(current, dir, id);
    if (outcome?.kind === "state") current = outcome.state;
    if (outcome?.kind === "unlinked") added.push(outcome.item);
  }
  return setUnlinked(current, [...current.unlinked, ...added]);
}

export function resolveNakaIds(
  ids: number[],
  state: SyncState,
  ports: ResolverPorts,
): Promise<SyncState> {
  return resolveIds(ids, state, nakaDirection(ports));
}

export function resolveScIds(
  ids: number[],
  state: SyncState,
  ports: ResolverPorts,
): Promise<SyncState> {
  return resolveIds(ids, state, scDirection(ports));
}
