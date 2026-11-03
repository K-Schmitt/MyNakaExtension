import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import {
  addPending,
  emptyState,
  isHandled,
  markAsked,
  markHandled,
  type PendingItem,
  resolvePending,
  type SyncState,
  setSnapshot,
  settlePair,
  setUnlinked,
  type UnlinkedItem,
  unsettlePair,
  upsertMapping,
} from "../src/core/state";

const p = (nakaId: number, scId: number): Pair => ({ nakaId, scId });

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function rich(): SyncState {
  return {
    ...emptyState(),
    mapping: [p(1, 10), p(2, 20)],
    snapshot: [p(1, 10)],
    settled: [p(3, 30)],
    pending: [
      { kind: "removal", removeFrom: "sc", pair: p(1, 10), asked: false },
      { kind: "ambiguity", side: "naka", id: 5, candidateIds: [7, 8] },
    ],
    handled: ["movie:1"],
    unlinked: [{ side: "sc", id: 9, title: "X", reason: "no-match" }],
    retryLast: [p(4, 40), p(1, 10)],
  };
}

const removal = (
  removeFrom: "naka" | "sc",
  pair: Pair,
  asked = false,
): PendingItem => ({ kind: "removal", removeFrom, pair, asked });
const ambiguity = (
  side: "naka" | "sc",
  id: number,
  candidateIds: number[] = [1],
): PendingItem => ({ kind: "ambiguity", side, id, candidateIds });

describe("emptyState", () => {
  it("has the initial shape", () => {
    expect(emptyState()).toEqual({
      version: 1,
      mapping: [],
      snapshot: [],
      settled: [],
      pending: [],
      handled: [],
      unlinked: [],
      retryLast: [],
      threshold: 0.9,
    });
  });
});

describe("upsertMapping", () => {
  it("replaces a pair sharing the nakaId", () => {
    const s = upsertMapping(upsertMapping(emptyState(), p(1, 10)), p(1, 11));
    expect(s.mapping).toEqual([p(1, 11)]);
  });
  it("replaces a pair sharing the scId", () => {
    const s = upsertMapping(upsertMapping(emptyState(), p(1, 10)), p(2, 10));
    expect(s.mapping).toEqual([p(2, 10)]);
  });
  it("keeps two distinct pairs", () => {
    const s = upsertMapping(upsertMapping(emptyState(), p(1, 10)), p(2, 20));
    expect(s.mapping).toEqual([p(1, 10), p(2, 20)]);
  });
  it("keeps the same pair once", () => {
    const s = upsertMapping(upsertMapping(emptyState(), p(1, 10)), p(1, 10));
    expect(s.mapping).toEqual([p(1, 10)]);
  });
  it("replaces both conflicting pairs at once", () => {
    const base = upsertMapping(upsertMapping(emptyState(), p(1, 10)), p(2, 20));
    expect(upsertMapping(base, p(1, 20)).mapping).toEqual([p(1, 20)]);
  });
});

describe("settlePair / unsettlePair", () => {
  it("settling twice keeps one", () => {
    const s = settlePair(settlePair(emptyState(), p(1, 10)), p(1, 10));
    expect(s.settled).toEqual([p(1, 10)]);
  });
  it("settling keeps other pairs", () => {
    const s = settlePair(settlePair(emptyState(), p(1, 10)), p(1, 11));
    expect(s.settled).toEqual([p(1, 10), p(1, 11)]);
  });
  it("unsettle removes only the pair", () => {
    const s = unsettlePair(
      settlePair(settlePair(emptyState(), p(1, 10)), p(2, 20)),
      p(1, 10),
    );
    expect(s.settled).toEqual([p(2, 20)]);
  });
  it("unsettle keeps pairs sharing only one id", () => {
    let s = settlePair(emptyState(), p(1, 10));
    s = settlePair(s, p(1, 11));
    s = settlePair(s, p(2, 10));
    expect(unsettlePair(s, p(1, 10)).settled).toEqual([p(1, 11), p(2, 10)]);
  });
  it("unsettle of an absent pair does nothing", () => {
    const base = settlePair(emptyState(), p(1, 10));
    expect(unsettlePair(base, p(9, 9))).toEqual(base);
  });
});

describe("setSnapshot", () => {
  it("replaces the list", () => {
    const s = setSnapshot(setSnapshot(emptyState(), [p(1, 10)]), [p(2, 20)]);
    expect(s.snapshot).toEqual([p(2, 20)]);
  });
  it("removes duplicate pairs", () => {
    expect(
      setSnapshot(emptyState(), [p(1, 10), p(2, 20), p(1, 10)]).snapshot,
    ).toEqual([p(1, 10), p(2, 20)]);
  });
  it("does not collapse pairs sharing the scId", () => {
    expect(setSnapshot(emptyState(), [p(1, 10), p(2, 10)]).snapshot).toEqual([
      p(1, 10),
      p(2, 10),
    ]);
  });
  it("does not collapse pairs sharing one id", () => {
    expect(setSnapshot(emptyState(), [p(1, 10), p(1, 11)]).snapshot).toEqual([
      p(1, 10),
      p(1, 11),
    ]);
  });
});

describe("addPending", () => {
  it("keeps an equal removal once", () => {
    const s = addPending(
      addPending(emptyState(), removal("sc", p(1, 10))),
      removal("sc", p(1, 10)),
    );
    expect(s.pending).toHaveLength(1);
  });
  it("keeps removals differing by removeFrom", () => {
    const s = addPending(
      addPending(emptyState(), removal("sc", p(1, 10))),
      removal("naka", p(1, 10)),
    );
    expect(s.pending).toHaveLength(2);
  });
  it("keeps removals differing by pair", () => {
    const s = addPending(
      addPending(emptyState(), removal("sc", p(1, 10))),
      removal("sc", p(2, 10)),
    );
    expect(s.pending).toHaveLength(2);
  });
  it("keeps removals differing by scId only", () => {
    const s = addPending(
      addPending(emptyState(), removal("sc", p(1, 10))),
      removal("sc", p(1, 11)),
    );
    expect(s.pending).toHaveLength(2);
  });
  it("keeps an equal ambiguity once", () => {
    const s = addPending(
      addPending(emptyState(), ambiguity("naka", 5)),
      ambiguity("naka", 5),
    );
    expect(s.pending).toHaveLength(1);
  });
  it("keeps ambiguities differing by side or id", () => {
    let s = addPending(emptyState(), ambiguity("naka", 5));
    s = addPending(s, ambiguity("sc", 5));
    s = addPending(s, ambiguity("naka", 6));
    expect(s.pending).toHaveLength(3);
  });
  it("never confuses a removal and an ambiguity", () => {
    const s = addPending(
      addPending(emptyState(), removal("sc", p(1, 10))),
      ambiguity("sc", 1),
    );
    expect(s.pending).toHaveLength(2);
  });
});

describe("resolvePending", () => {
  it("removes an equal removal only", () => {
    let s = addPending(emptyState(), removal("sc", p(1, 10)));
    s = addPending(s, removal("naka", p(1, 10)));
    s = addPending(s, removal("sc", p(2, 20)));
    s = resolvePending(s, removal("sc", p(1, 10), true));
    expect(s.pending).toEqual([
      removal("naka", p(1, 10)),
      removal("sc", p(2, 20)),
    ]);
  });
  it("removes an equal ambiguity only", () => {
    let s = addPending(emptyState(), ambiguity("naka", 5));
    s = addPending(s, ambiguity("sc", 5));
    s = addPending(s, ambiguity("naka", 6));
    s = resolvePending(s, ambiguity("naka", 5, [99]));
    expect(s.pending).toEqual([ambiguity("sc", 5), ambiguity("naka", 6)]);
  });
  it("does nothing when absent", () => {
    const base = addPending(emptyState(), ambiguity("naka", 5));
    expect(resolvePending(base, ambiguity("naka", 7))).toEqual(base);
  });
  it("does not remove a removal with an ambiguity", () => {
    const base = addPending(emptyState(), removal("sc", p(1, 10)));
    expect(resolvePending(base, ambiguity("sc", 1))).toEqual(base);
  });
});

describe("markAsked", () => {
  it("flips only the matching removal", () => {
    let s = addPending(emptyState(), removal("sc", p(1, 10)));
    s = addPending(s, removal("sc", p(2, 20)));
    s = addPending(s, ambiguity("naka", 1));
    s = markAsked(s, p(1, 10));
    expect(s.pending).toEqual([
      removal("sc", p(1, 10), true),
      removal("sc", p(2, 20), false),
      ambiguity("naka", 1),
    ]);
  });
  it("flips every removal with that pair", () => {
    let s = addPending(emptyState(), removal("sc", p(1, 10)));
    s = addPending(s, removal("naka", p(1, 10)));
    expect(
      markAsked(s, p(1, 10)).pending.every(
        (i) => i.kind === "removal" && i.asked,
      ),
    ).toBe(true);
  });
  it("matches on both ids", () => {
    const s = addPending(emptyState(), removal("sc", p(1, 10)));
    expect(markAsked(s, p(1, 11)).pending).toEqual([removal("sc", p(1, 10))]);
    expect(markAsked(s, p(2, 10)).pending).toEqual([removal("sc", p(1, 10))]);
  });
});

describe("markHandled / isHandled", () => {
  it("records a key", () => {
    const s = markHandled(emptyState(), "movie:3109");
    expect(isHandled(s, "movie:3109")).toBe(true);
    expect(isHandled(s, "movie:1")).toBe(false);
  });
  it("never records a key twice", () => {
    const s = markHandled(markHandled(emptyState(), "a"), "a");
    expect(s.handled).toEqual(["a"]);
  });
  it("keeps earlier keys", () => {
    expect(markHandled(markHandled(emptyState(), "a"), "b").handled).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("setUnlinked", () => {
  it("replaces the list and keeps order", () => {
    const a: UnlinkedItem = {
      side: "naka",
      id: 2,
      title: "B",
      reason: "no-match",
    };
    const b: UnlinkedItem = {
      side: "sc",
      id: 1,
      title: "A",
      reason: "not-in-catalogue",
    };
    const s = setUnlinked(setUnlinked(emptyState(), [b]), [a, b]);
    expect(s.unlinked).toEqual([a, b]);
  });
  it("does not alias the given array", () => {
    const items: UnlinkedItem[] = [
      { side: "sc", id: 1, title: "A", reason: "no-match" },
    ];
    expect(setUnlinked(emptyState(), items).unlinked).not.toBe(items);
  });
});

describe("field preservation on a fully populated state", () => {
  const frozen = (): SyncState => deepFreeze(rich());

  it("upsertMapping changes only mapping", () => {
    expect(upsertMapping(frozen(), p(1, 11))).toEqual({
      ...rich(),
      mapping: [p(2, 20), p(1, 11)],
    });
  });
  it("settlePair changes only settled", () => {
    expect(settlePair(frozen(), p(4, 40))).toEqual({
      ...rich(),
      settled: [p(3, 30), p(4, 40)],
    });
  });
  it("settlePair of a present pair changes nothing", () => {
    expect(settlePair(frozen(), p(3, 30))).toEqual(rich());
  });
  it("unsettlePair changes only settled", () => {
    expect(unsettlePair(frozen(), p(3, 30))).toEqual({
      ...rich(),
      settled: [],
    });
  });
  it("unsettlePair of an absent pair changes nothing", () => {
    expect(unsettlePair(frozen(), p(9, 9))).toEqual(rich());
  });
  it("setSnapshot changes only snapshot", () => {
    expect(setSnapshot(frozen(), [p(6, 60), p(6, 60)])).toEqual({
      ...rich(),
      snapshot: [p(6, 60)],
    });
  });
  it("addPending changes only pending", () => {
    const item = ambiguity("sc", 77);
    expect(addPending(frozen(), item)).toEqual({
      ...rich(),
      pending: [...rich().pending, item],
    });
  });
  it("addPending of a present item changes nothing", () => {
    expect(addPending(frozen(), ambiguity("naka", 5))).toEqual(rich());
  });
  it("resolvePending changes only pending", () => {
    expect(resolvePending(frozen(), ambiguity("naka", 5))).toEqual({
      ...rich(),
      pending: [removal("sc", p(1, 10))],
    });
  });
  it("resolvePending of an absent item changes nothing", () => {
    expect(resolvePending(frozen(), ambiguity("sc", 99))).toEqual(rich());
  });
  it("markAsked changes only pending", () => {
    expect(markAsked(frozen(), p(1, 10))).toEqual({
      ...rich(),
      pending: [removal("sc", p(1, 10), true), ambiguity("naka", 5, [7, 8])],
    });
  });
  it("markHandled changes only handled", () => {
    expect(markHandled(frozen(), "movie:2")).toEqual({
      ...rich(),
      handled: ["movie:1", "movie:2"],
    });
  });
  it("markHandled of a present key changes nothing", () => {
    expect(markHandled(frozen(), "movie:1")).toEqual(rich());
  });
  it("setUnlinked changes only unlinked", () => {
    const items: UnlinkedItem[] = [
      { side: "naka", id: 4, title: "Z", reason: "not-in-catalogue" },
    ];
    expect(setUnlinked(frozen(), items)).toEqual({
      ...rich(),
      unlinked: items,
    });
  });
});

const updaters: [string, (s: SyncState) => SyncState][] = [
  ["upsertMapping", (s) => upsertMapping(s, p(1, 99))],
  ["upsertMapping new", (s) => upsertMapping(s, p(8, 88))],
  ["settlePair", (s) => settlePair(s, p(4, 40))],
  ["unsettlePair", (s) => unsettlePair(s, p(3, 30))],
  ["setSnapshot", (s) => setSnapshot(s, [p(5, 50), p(5, 50)])],
  ["addPending", (s) => addPending(s, ambiguity("sc", 77))],
  ["resolvePending", (s) => resolvePending(s, ambiguity("naka", 5))],
  ["markAsked", (s) => markAsked(s, p(1, 10))],
  ["markHandled", (s) => markHandled(s, "movie:2")],
  ["setUnlinked", (s) => setUnlinked(s, [])],
];

describe("retryLast", () => {
  for (const [name, run] of updaters) {
    it(`${name} keeps retryLast unchanged and in order`, () => {
      expect(run(deepFreeze(rich())).retryLast).toEqual([p(4, 40), p(1, 10)]);
    });
  }
});

describe("immutability", () => {
  for (const [name, run] of updaters) {
    it(`${name} does not mutate its input`, () => {
      const input = rich();
      const copy = structuredClone(input);
      const result = run(deepFreeze(input));
      expect(input).toEqual(copy);
      expect(result).not.toBe(input);
    });
  }
});
