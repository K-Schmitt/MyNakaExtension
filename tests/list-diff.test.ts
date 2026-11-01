import { describe, expect, it } from "vitest";
import {
  type Pair,
  planListSync,
  type SyncInput,
  type SyncPlan,
} from "../src/core/list-diff";

const P: Pair = { nakaId: 1, scId: 10 };
const EMPTY: SyncPlan = {
  addToSc: [],
  addToNaka: [],
  confirmRemoval: [],
  resolveNaka: [],
  resolveSc: [],
};

function input(over: Partial<SyncInput>): SyncInput {
  return { naka: new Set(), sc: new Set(), snapshot: [], mapping: [], ...over };
}

describe("planListSync", () => {
  it("returns an empty plan for empty inputs", () => {
    expect(planListSync(input({}))).toEqual(EMPTY);
  });

  it("does nothing for a pair present in both lists", () => {
    const plan = planListSync(
      input({
        naka: new Set([1]),
        sc: new Set([10]),
        mapping: [P],
        snapshot: [P],
      }),
    );
    expect(plan).toEqual(EMPTY);
  });

  it("adds to SensCritique a new pair only in Naka", () => {
    const plan = planListSync(input({ naka: new Set([1]), mapping: [P] }));
    expect(plan).toEqual({ ...EMPTY, addToSc: [P] });
  });

  it("adds to Naka a new pair only in SensCritique", () => {
    const plan = planListSync(input({ sc: new Set([10]), mapping: [P] }));
    expect(plan).toEqual({ ...EMPTY, addToNaka: [P] });
  });

  it("proposes removal from Naka when a snapshot pair is now only in Naka", () => {
    const plan = planListSync(
      input({ naka: new Set([1]), mapping: [P], snapshot: [P] }),
    );
    expect(plan).toEqual({
      ...EMPTY,
      confirmRemoval: [{ removeFrom: "naka", pair: P }],
    });
  });

  it("proposes removal from SensCritique when a snapshot pair is now only there", () => {
    const plan = planListSync(
      input({ sc: new Set([10]), mapping: [P], snapshot: [P] }),
    );
    expect(plan).toEqual({
      ...EMPTY,
      confirmRemoval: [{ removeFrom: "sc", pair: P }],
    });
  });

  it("never proposes a removal on the first sync (empty snapshot)", () => {
    const plan = planListSync(
      input({
        naka: new Set([1, 2]),
        sc: new Set([11]),
        mapping: [P, { nakaId: 2, scId: 20 }],
      }),
    );
    expect(plan.confirmRemoval).toEqual([]);
    expect(plan.addToSc).toEqual([P, { nakaId: 2, scId: 20 }]);
    expect(plan.addToNaka).toEqual([]);
  });

  it("does nothing for a snapshot pair absent from both lists", () => {
    expect(planListSync(input({ mapping: [P], snapshot: [P] }))).toEqual(EMPTY);
  });

  it("does nothing for a mapped pair absent from both lists", () => {
    expect(planListSync(input({ mapping: [P] }))).toEqual(EMPTY);
  });

  it("resolves ids that belong to no known pair", () => {
    const plan = planListSync(input({ naka: new Set([7]), sc: new Set([99]) }));
    expect(plan).toEqual({ ...EMPTY, resolveNaka: [7], resolveSc: [99] });
  });

  it("resolves only the unknown ids when others are known", () => {
    const plan = planListSync(
      input({
        naka: new Set([1, 7]),
        sc: new Set([10, 99]),
        mapping: [P],
        snapshot: [P],
      }),
    );
    expect(plan).toEqual({ ...EMPTY, resolveNaka: [7], resolveSc: [99] });
  });

  it("treats a snapshot pair missing from mapping as known", () => {
    const plan = planListSync(
      input({ naka: new Set([1]), sc: new Set([10]), snapshot: [P] }),
    );
    expect(plan).toEqual(EMPTY);
  });

  it("treats a mapping pair missing from snapshot as known", () => {
    const plan = planListSync(
      input({ naka: new Set([1]), sc: new Set([10]), mapping: [P] }),
    );
    expect(plan).toEqual(EMPTY);
  });

  it("yields one action for a pair duplicated in mapping and snapshot", () => {
    const plan = planListSync(
      input({ naka: new Set([1]), mapping: [P, P], snapshot: [P, P] }),
    );
    expect(plan.confirmRemoval).toHaveLength(1);
    const fresh = planListSync(
      input({ naka: new Set([1]), mapping: [P, { ...P }] }),
    );
    expect(fresh.addToSc).toEqual([P]);
  });

  it("emits no add for a Naka id mapped to two SC ids", () => {
    const plan = planListSync(
      input({
        naka: new Set([1]),
        sc: new Set([10]),
        mapping: [P, { nakaId: 1, scId: 11 }],
      }),
    );
    expect(plan).toEqual({ ...EMPTY, resolveNaka: [1], resolveSc: [10] });
  });

  it("emits no add for an SC id mapped to two Naka ids", () => {
    const plan = planListSync(
      input({
        naka: new Set([1]),
        sc: new Set([10]),
        mapping: [P, { nakaId: 2, scId: 10 }],
      }),
    );
    expect(plan).toEqual({ ...EMPTY, resolveNaka: [1], resolveSc: [10] });
  });

  it("emits no removal for a stale snapshot pair conflicting with the mapping", () => {
    const plan = planListSync(
      input({
        naka: new Set([1]),
        sc: new Set([11]),
        snapshot: [P],
        mapping: [{ nakaId: 1, scId: 11 }],
      }),
    );
    expect(plan).toEqual({ ...EMPTY, resolveNaka: [1], resolveSc: [11] });
  });

  it("lists conflicted ids only when present in the current lists", () => {
    const plan = planListSync(input({ mapping: [P, { nakaId: 1, scId: 11 }] }));
    expect(plan).toEqual(EMPTY);
  });

  it("orders unresolved ids first, then conflicted ids, without duplicates", () => {
    const plan = planListSync(
      input({
        naka: new Set([1, 7, 3]),
        sc: new Set([10, 99, 30]),
        mapping: [
          { nakaId: 1, scId: 10 },
          { nakaId: 1, scId: 11 },
          { nakaId: 3, scId: 30 },
          { nakaId: 3, scId: 31 },
        ],
      }),
    );
    expect(plan.resolveNaka).toEqual([7, 1, 3]);
    expect(plan.resolveSc).toEqual([99, 10, 30]);
  });

  it("keeps acting on non-conflicted pairs next to conflicted ones", () => {
    const ok: Pair = { nakaId: 5, scId: 50 };
    const plan = planListSync(
      input({
        naka: new Set([1, 5]),
        mapping: [P, { nakaId: 1, scId: 11 }, ok],
      }),
    );
    expect(plan.addToSc).toEqual([ok]);
    expect(plan.resolveNaka).toEqual([1]);
  });

  it("proposes no removal once the caller drops the pair from the snapshot", () => {
    const lists = { naka: new Set([1]), mapping: [P] };
    expect(
      planListSync(input({ ...lists, snapshot: [P] })).confirmRemoval,
    ).toHaveLength(1);
    const after = planListSync(input({ ...lists, snapshot: [] }));
    expect(after.confirmRemoval).toEqual([]);
    expect(after.addToSc).toEqual([P]);
  });

  it("handles several pairs independently", () => {
    const a: Pair = { nakaId: 1, scId: 10 };
    const b: Pair = { nakaId: 2, scId: 20 };
    const c: Pair = { nakaId: 3, scId: 30 };
    const plan = planListSync(
      input({
        naka: new Set([1, 3]),
        sc: new Set([20, 30]),
        mapping: [a, b, c],
        snapshot: [a, b],
      }),
    );
    expect(plan.confirmRemoval).toEqual([
      { removeFrom: "naka", pair: a },
      { removeFrom: "sc", pair: b },
    ]);
    expect(plan.addToSc).toEqual([]);
    expect(plan.addToNaka).toEqual([]);
  });

  it("does not resolve an id whose partner is known under another pair", () => {
    const plan = planListSync(input({ naka: new Set([1]), mapping: [P] }));
    expect(plan.resolveNaka).toEqual([]);
    expect(plan.resolveSc).toEqual([]);
  });
});
