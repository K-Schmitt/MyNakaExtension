export type Pair = { nakaId: number; scId: number };

export type SyncInput = {
  naka: ReadonlySet<number>;
  sc: ReadonlySet<number>;
  snapshot: readonly Pair[];
  mapping: readonly Pair[];
};

export type Removal = { removeFrom: "naka" | "sc"; pair: Pair };

export type SyncPlan = {
  addToSc: Pair[];
  addToNaka: Pair[];
  confirmRemoval: Removal[];
  resolveNaka: number[];
  resolveSc: number[];
};

function pairKey(pair: Pair): string {
  return `${pair.nakaId}:${pair.scId}`;
}

function knownPairs(
  mapping: readonly Pair[],
  snapshot: readonly Pair[],
): Pair[] {
  const unique = new Map<string, Pair>();
  for (const pair of [...mapping, ...snapshot]) {
    if (!unique.has(pairKey(pair))) unique.set(pairKey(pair), pair);
  }
  return [...unique.values()];
}

function countBy(ids: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function conflictedPairs(pairs: Pair[]): Set<Pair> {
  const byNaka = countBy(pairs.map((p) => p.nakaId));
  const bySc = countBy(pairs.map((p) => p.scId));
  return new Set(
    pairs.filter(
      (p) => (byNaka.get(p.nakaId) ?? 0) > 1 || (bySc.get(p.scId) ?? 0) > 1,
    ),
  );
}

function resolvableIds(
  present: ReadonlySet<number>,
  pairIds: number[],
  conflictedIds: number[],
): number[] {
  const known = new Set(pairIds);
  const unresolved = [...present].filter((id) => !known.has(id));
  const conflicted = conflictedIds.filter((id) => present.has(id));
  return [...new Set([...unresolved, ...conflicted])];
}

function classifyPair(
  pair: Pair,
  input: SyncInput,
  inSnapshot: boolean,
  plan: SyncPlan,
): void {
  const inNaka = input.naka.has(pair.nakaId);
  const inSc = input.sc.has(pair.scId);
  if (inNaka === inSc) return;
  if (inNaka) {
    if (inSnapshot) plan.confirmRemoval.push({ removeFrom: "naka", pair });
    else plan.addToSc.push(pair);
  } else if (inSnapshot) {
    plan.confirmRemoval.push({ removeFrom: "sc", pair });
  } else {
    plan.addToNaka.push(pair);
  }
}

export function planListSync(input: SyncInput): SyncPlan {
  const plan: SyncPlan = {
    addToSc: [],
    addToNaka: [],
    confirmRemoval: [],
    resolveNaka: [],
    resolveSc: [],
  };
  const snapshotKeys = new Set(input.snapshot.map(pairKey));
  const pairs = knownPairs(input.mapping, input.snapshot);
  const conflicted = conflictedPairs(pairs);
  for (const pair of pairs) {
    if (conflicted.has(pair)) continue;
    classifyPair(pair, input, snapshotKeys.has(pairKey(pair)), plan);
  }
  const bad = pairs.filter((p) => conflicted.has(p));
  plan.resolveNaka = resolvableIds(
    input.naka,
    pairs.map((p) => p.nakaId),
    bad.map((p) => p.nakaId),
  );
  plan.resolveSc = resolvableIds(
    input.sc,
    pairs.map((p) => p.scId),
    bad.map((p) => p.scId),
  );
  return plan;
}
