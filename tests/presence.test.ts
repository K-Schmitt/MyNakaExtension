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
    expect(nextPresence(EMPTY, 4, { naka: [1], sc: [10] }, [])).toEqual({
      naka: [e(1, 4, 4)],
      sc: [e(10, 4, 4)],
    });
  });

  it("extends an interval that reached the previous run", () => {
    const before = { naka: [e(1, 2, 3)], sc: [e(10, 3, 3)] };
    expect(nextPresence(before, 4, { naka: [1], sc: [10] }, [])).toEqual({
      naka: [e(1, 2, 4)],
      sc: [e(10, 3, 4)],
    });
  });

  it("starts a new interval for an id back after a gap", () => {
    const before = { naka: [e(1, 1, 2)], sc: [e(10, 1, 1)] };
    expect(nextPresence(before, 4, { naka: [1], sc: [10] }, [])).toEqual({
      naka: [e(1, 4, 4)],
      sc: [e(10, 4, 4)],
    });
  });

  it("keeps the interval of an absent id that is not mapped", () => {
    const before = { naka: [e(1, 1, 2)], sc: [e(10, 2, 3)] };
    expect(nextPresence(before, 4, { naka: [], sc: [] }, [])).toEqual(before);
  });

  it("drops the interval of an absent id mapped on its own side, and only that one", () => {
    const before = {
      naka: [e(1, 1, 3), e(2, 1, 3)],
      sc: [e(10, 1, 3), e(20, 1, 3)],
    };
    // Naka 2 and SensCritique 10 are mapped, but each only through the other side's number.
    const mapping = [p(1, 30), p(40, 10), p(20, 50)];
    expect(nextPresence(before, 4, { naka: [], sc: [] }, mapping)).toEqual({
      naka: [e(2, 1, 3)],
      sc: [e(20, 1, 3)],
    });
  });

  it("keeps a present mapped id", () => {
    const before = { naka: [e(1, 1, 3)], sc: [e(10, 1, 3)] };
    expect(
      nextPresence(before, 4, { naka: [1], sc: [10] }, [p(1, 10)]),
    ).toEqual({ naka: [e(1, 1, 4)], sc: [e(10, 1, 4)] });
  });

  it("counts an id listed twice once", () => {
    expect(nextPresence(EMPTY, 1, { naka: [1, 1], sc: [] }, [])).toEqual({
      naka: [e(1, 1, 1)],
      sc: [],
    });
  });

  it("keeps the stored order, then the new ids in list order", () => {
    const before = { naka: [e(9, 1, 1), e(3, 1, 1)], sc: [] };
    expect(nextPresence(before, 2, { naka: [5, 3, 1], sc: [] }, [])).toEqual({
      naka: [e(9, 1, 1), e(3, 1, 2), e(5, 2, 2), e(1, 2, 2)],
      sc: [],
    });
  });

  it("does not mutate a deep-frozen presence", () => {
    const before = deepFreeze({ naka: [e(1, 1, 3)], sc: [e(10, 1, 1)] });
    const copy = structuredClone(before);
    nextPresence(before, 4, { naka: [1, 2], sc: [] }, [p(9, 10)]);
    expect(before).toEqual(copy);
  });
});

const seenTogether = (presence: Presence, pair: Pair): boolean =>
  withPairsSeenTogether([], [pair], presence).length === 1;

describe("two ids seen together", () => {
  const at = (naka: [number, number], sc: [number, number]): Presence => ({
    naka: [e(1, ...naka)],
    sc: [e(10, ...sc)],
  });

  it.each([
    ["the same single run", [1, 1], [1, 1], true],
    ["overlapping intervals", [1, 3], [3, 5], true],
    ["one inside the other", [1, 9], [4, 5], true],
    ["adjacent intervals", [1, 2], [3, 4], false],
    ["adjacent the other way", [3, 4], [1, 2], false],
    ["disjoint intervals", [1, 2], [5, 6], false],
  ] as const)("%s: %s", (_name, naka, sc, expected) => {
    expect(seenTogether(at([...naka], [...sc]), p(1, 10))).toBe(expected);
  });

  it("needs an entry for both ids", () => {
    expect(seenTogether({ naka: [e(1, 1, 1)], sc: [] }, p(1, 10))).toBe(false);
    expect(seenTogether({ naka: [], sc: [e(10, 1, 1)] }, p(1, 10))).toBe(false);
  });

  it("reads each id on its own side", () => {
    const crossed = { naka: [e(10, 1, 1)], sc: [e(1, 1, 1)] };
    expect(seenTogether(crossed, p(1, 10))).toBe(false);
  });
});

describe("withPairsSeenTogether", () => {
  const presence = {
    naka: [e(1, 1, 2), e(2, 1, 1), e(3, 1, 1)],
    sc: [e(10, 2, 2), e(20, 2, 2), e(30, 1, 1)],
  };

  it("adds the mapped pairs seen together, after the stored snapshot", () => {
    const mapping = [p(1, 10), p(2, 20), p(3, 30)];
    expect(withPairsSeenTogether([p(7, 70)], mapping, presence)).toEqual([
      p(7, 70),
      p(1, 10),
      p(3, 30),
    ]);
  });

  it("never adds a pair twice", () => {
    expect(withPairsSeenTogether([p(1, 10)], [p(1, 10)], presence)).toEqual([
      p(1, 10),
    ]);
  });

  it("adds nothing that is not mapped", () => {
    expect(withPairsSeenTogether([], [], presence)).toEqual([]);
  });
});
