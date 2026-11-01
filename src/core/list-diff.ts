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

function unresolvedIds(
  ids: ReadonlySet<number>,
  knownIds: ReadonlySet<number>,
): number[] {
  return [...ids].filter((id) => !knownIds.has(id));
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
  for (const pair of pairs) {
    classifyPair(pair, input, snapshotKeys.has(pairKey(pair)), plan);
  }
  plan.resolveNaka = unresolvedIds(
    input.naka,
    new Set(pairs.map((p) => p.nakaId)),
  );
  plan.resolveSc = unresolvedIds(input.sc, new Set(pairs.map((p) => p.scId)));
  return plan;
}
