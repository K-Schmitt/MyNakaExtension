import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import {
  nextPresence,
  type Presence,
  withPairsSeenTogether,
} from "../src/core/presence";

const e = (id: number, from: number, to: number) => ({ id, from, to });
const p = (nakaId: number, scId: number): Pair => ({ nakaId, scId });
const EMPTY: Presence = { naka: [], sc: [] };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe("nextPresence", () => {
  it("starts an interval for an id seen for the first time", () => {
    expect(nextPresence(EMPTY, 4, { naka: [1], sc: [10] })).toEqual({
      naka: [e(1, 4, 4)],
      sc: [e(10, 4, 4)],
    });
  });

  it("extends the interval that reached the previous run", () => {
    const before = { naka: [e(1, 2, 3)], sc: [e(10, 3, 3)] };
    expect(nextPresence(before, 4, { naka: [1], sc: [10] })).toEqual({
      naka: [e(1, 2, 4)],
      sc: [e(10, 3, 4)],
    });
  });

  it("starts a new interval beside the old one for an id back after a gap", () => {
    const before = { naka: [e(1, 1, 2)], sc: [e(10, 1, 1)] };
    expect(nextPresence(before, 4, { naka: [1], sc: [10] })).toEqual({
      naka: [e(1, 1, 2), e(1, 4, 4)],
      sc: [e(10, 1, 1), e(10, 4, 4)],
    });
  });

  it("extends only the latest interval of an id with several", () => {
    const before = { naka: [e(1, 1, 2), e(1, 4, 5)], sc: [] };
    expect(nextPresence(before, 6, { naka: [1], sc: [] })).toEqual({
      naka: [e(1, 1, 2), e(1, 4, 6)],
      sc: [],
    });
  });

  it("keeps every interval of an absent id, mapped or not", () => {
    const before = {
      naka: [e(1, 1, 3), e(1, 5, 5), e(2, 1, 2)],
      sc: [e(10, 2, 3), e(20, 1, 1)],
    };
    expect(nextPresence(before, 7, { naka: [], sc: [] })).toEqual(before);
  });

  it("counts an id listed twice once", () => {
    expect(nextPresence(EMPTY, 1, { naka: [1, 1], sc: [] })).toEqual({
      naka: [e(1, 1, 1)],
      sc: [],
    });
  });

  it("keeps the stored order, then the new intervals in list order", () => {
    const before = { naka: [e(9, 1, 1), e(3, 1, 1)], sc: [] };
    expect(nextPresence(before, 2, { naka: [5, 3, 1], sc: [] })).toEqual({
      naka: [e(9, 1, 1), e(3, 1, 2), e(5, 2, 2), e(1, 2, 2)],
      sc: [],
    });
  });

  it("does not mutate a deep-frozen presence", () => {
    const before = deepFreeze({ naka: [e(1, 1, 3)], sc: [e(10, 1, 1)] });
    const copy = structuredClone(before);
    nextPresence(before, 4, { naka: [1, 2], sc: [10] });
    expect(before).toEqual(copy);
  });
});

// Would the pair (1, 10), had it been mapped all along, be in the snapshot at the end of `run`?
const snapshotted = (
  naka: [number, number][],
  sc: [number, number][],
  run: number,
): boolean =>
  withPairsSeenTogether([], [p(1, 10)], {
    presence: {
      naka: naka.map(([from, to]) => e(1, from, to)),
      sc: sc.map(([from, to]) => e(10, from, to)),
    },
    run,
  }).length === 1;

describe("the snapshot a late-mapped pair would have had", () => {
  it("both listed in the last completed run: in", () => {
    expect(snapshotted([[1, 3]], [[3, 3]], 3)).toBe(true);
  });

  it("listed together once, one of them in every run since: in", () => {
    expect(snapshotted([[1, 5]], [[1, 2]], 5)).toBe(true);
  });

  it("never listed in the same run: out", () => {
    expect(snapshotted([[1, 2]], [[3, 4]], 4)).toBe(false);
    expect(snapshotted([[3, 4]], [[1, 2]], 4)).toBe(false);
  });

  it("a run with neither listed after the last time together: out (removed from both)", () => {
    expect(snapshotted([[1, 2]], [[1, 2]], 3)).toBe(false);
    expect(
      snapshotted(
        [
          [1, 2],
          [4, 4],
        ],
        [[1, 2]],
        4,
      ),
    ).toBe(false);
  });

  it("a gap exactly at the run after the last time together: out", () => {
    expect(
      snapshotted(
        [
          [1, 1],
          [3, 5],
        ],
        [[1, 1]],
        5,
      ),
    ).toBe(false);
  });

  it("coverage that stops one run before the last completed run: out", () => {
    expect(snapshotted([[1, 4]], [[1, 2]], 5)).toBe(false);
  });

  it("the LAST time both were listed counts: they left together, came back, and one stayed", () => {
    expect(
      snapshotted(
        [
          [1, 1],
          [3, 5],
        ],
        [
          [1, 1],
          [3, 3],
        ],
        5,
      ),
    ).toBe(true);
  });

  it("alternating presence keeps it in (a chain a fuzz test found)", () => {
    expect(
      snapshotted(
        [[1, 4]],
        [
          [1, 2],
          [5, 19],
        ],
        19,
      ),
    ).toBe(true);
  });

  it("a delayed swap: Naka back one run after SensCritique left: in", () => {
    expect(
      snapshotted(
        [
          [1, 2],
          [4, 4],
        ],
        [[1, 3]],
        4,
      ),
    ).toBe(true);
  });

  it("needs intervals on both sides, each read on its own side", () => {
    expect(snapshotted([[1, 3]], [], 3)).toBe(false);
    expect(snapshotted([], [[1, 3]], 3)).toBe(false);
    const crossed = { naka: [e(10, 1, 1)], sc: [e(1, 1, 1)] };
    expect(
      withPairsSeenTogether([], [p(1, 10)], { presence: crossed, run: 1 }),
    ).toEqual([]);
  });
});

describe("withPairsSeenTogether", () => {
  const presence = {
    naka: [e(1, 1, 2), e(2, 1, 1), e(3, 1, 2)],
    sc: [e(10, 2, 2), e(20, 2, 2), e(30, 1, 1)],
  };
  const loaded = { presence, run: 2 };

  it("adds the mapped pairs that would be in the snapshot, after the stored one", () => {
    const mapping = [p(1, 10), p(2, 20), p(3, 30)];
    expect(withPairsSeenTogether([p(7, 70)], mapping, loaded)).toEqual([
      p(7, 70),
      p(1, 10),
      p(3, 30),
    ]);
  });

  it("never adds a pair twice", () => {
    expect(withPairsSeenTogether([p(1, 10)], [p(1, 10)], loaded)).toEqual([
      p(1, 10),
    ]);
  });

  it("adds nothing that is not mapped", () => {
    expect(withPairsSeenTogether([], [], loaded)).toEqual([]);
  });
});
