import { describe, expect, it } from "vitest";
import { idsOfKey } from "../src/core/finish-event";
import type { Pair } from "../src/core/list-diff";
import {
  type AmbiguityItem,
  chooseCandidate,
  chooseNone,
  closeRemoval,
  dropLegacy,
  findRemoval,
  hideQuestion,
  keepPair,
  linkByHand,
  linkKey,
  MAX_CANDIDATES,
  openAmbiguity,
  QUESTION_KEY,
  questionKey,
  toCandidates,
  withFinish,
} from "../src/core/questions";
import {
  emptyState,
  type PendingItem,
  type SyncState,
} from "../src/core/state";
import type { Candidate } from "../src/core/title-match";

const p = (nakaId: number, scId: number): Pair => ({ nakaId, scId });
const cand = (id: number, year?: number) => ({
  id,
  title: `T${id}`,
  type: "serie" as const,
  ...(year === undefined ? {} : { year }),
});
const question = (over: Partial<AmbiguityItem> = {}): AmbiguityItem => ({
  kind: "ambiguity",
  side: "naka",
  id: 5,
  candidateIds: [50, 51],
  title: "Dune",
  candidates: [cand(50, 1998), cand(51, 2021)],
  ...over,
});
const removal = (removeFrom: "naka" | "sc", pair: Pair): PendingItem => ({
  kind: "removal",
  removeFrom,
  pair,
  asked: false,
});
const withPending = (...pending: PendingItem[]): SyncState => ({
  ...emptyState(),
  pending,
});

describe("question keys", () => {
  it("names each kind", () => {
    expect(questionKey(question())).toBe("ambiguity:naka:5");
    expect(questionKey(removal("sc", p(3, 4)))).toBe("removal:sc:3:4");
    expect(linkKey("sc", 9)).toBe("link:sc:9");
  });

  it.each([
    ["ambiguity:naka:5", true],
    ["ambiguity:sc:12", true],
    ["removal:naka:3:4", true],
    ["link:sc:9", true],
    ["ambiguity:naka:0", false],
    ["ambiguity:naka:05", false],
    ["removal:sc:3", false],
    ["link:sc:9:1", false],
    ["other:sc:9", false],
    ["ambiguity:web:9", false],
    ["ambiguity:naka:5\n", false],
    [" ambiguity:naka:5", false],
  ])("QUESTION_KEY %s -> %s", (key, ok) => {
    expect(QUESTION_KEY.test(key)).toBe(ok);
  });
});

describe("toCandidates", () => {
  const A: Candidate = { id: 1, title: "A", originalTitle: "Aa", type: "film" };
  const B: Candidate = { id: 2, title: "B", year: 1999, type: "film" };

  it("follows the order of ids, not of the search", () => {
    expect(toCandidates([A, B], [B.id, A.id])).toEqual([
      { id: 2, title: "B", year: 1999, type: "film" },
      { id: 1, title: "A", type: "film" },
    ]);
  });

  it("drops the original title and an absent year", () => {
    const [first] = toCandidates([A], [1]);
    expect(first).toStrictEqual({ id: 1, title: "A", type: "film" });
  });

  it("keeps the image when the search gave one", () => {
    const image = { posterPath: "/a.jpg" };
    const [first] = toCandidates([{ ...A, image }], [1]);
    expect(first?.image).toEqual(image);
  });

  it("keeps at most MAX_CANDIDATES", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...A,
      id: i + 1,
    }));
    const out = toCandidates(
      many,
      many.map((c) => c.id),
    );
    expect(out).toHaveLength(MAX_CANDIDATES);
    expect(out.map((c) => c.id)).toEqual(many.slice(0, 20).map((c) => c.id));
  });

  it("skips an id the search did not list", () => {
    expect(toCandidates([A], [7, 1]).map((c) => c.id)).toEqual([1]);
  });
});

describe("finders", () => {
  it("openAmbiguity matches side and id", () => {
    const q = question();
    const state = withPending(q);
    expect(openAmbiguity(state, "naka", 5)).toBe(q);
    expect(openAmbiguity(state, "sc", 5)).toBeUndefined();
    expect(openAmbiguity(state, "naka", 6)).toBeUndefined();
  });

  it("findRemoval matches the side and the pair", () => {
    const r = removal("sc", p(3, 4));
    const state = withPending(r);
    expect(findRemoval(state, "sc", p(3, 4))).toBe(r);
    expect(findRemoval(state, "naka", p(3, 4))).toBeUndefined();
    expect(findRemoval(state, "sc", p(3, 5))).toBeUndefined();
  });
});

describe("hideQuestion", () => {
  it("marks a removal asked, via its key", () => {
    const state = withPending(removal("sc", p(3, 4)));
    expect(hideQuestion(state, "removal:sc:3:4").pending).toEqual([
      { kind: "removal", removeFrom: "sc", pair: p(3, 4), asked: true },
    ]);
  });

  it("marks an ambiguity asked", () => {
    const state = withPending(question());
    expect(hideQuestion(state, "ambiguity:naka:5").pending).toEqual([
      question({ asked: true }),
    ]);
  });

  it.each(["ambiguity:naka:6", "link:naka:5", "nonsense", "removal:sc:3:5"])(
    "an unknown key %s changes nothing",
    (key) => {
      const state = withPending(question(), removal("sc", p(3, 4)));
      expect(hideQuestion(state, key)).toEqual(state);
    },
  );
});

describe("chooseCandidate", () => {
  it("refuses an id outside candidateIds", () => {
    const state = withPending(question());
    expect(chooseCandidate(state, "naka", 5, 99)).toBeUndefined();
    expect(state.mapping).toEqual([]);
  });

  it("refuses when there is no open question", () => {
    expect(chooseCandidate(emptyState(), "naka", 5, 50)).toBeUndefined();
    expect(
      chooseCandidate(withPending(question()), "sc", 5, 50),
    ).toBeUndefined();
  });

  it("maps the pair and closes the question", () => {
    const out = chooseCandidate(withPending(question()), "naka", 5, 51);
    expect(out?.mapping).toEqual([p(5, 51)]);
    expect(out?.pending).toEqual([]);
  });

  it("builds the pair the other way round on the sc side", () => {
    const q = question({
      side: "sc",
      id: 70,
      candidateIds: [5],
      candidates: [],
    });
    const out = chooseCandidate(withPending(q), "sc", 70, 5);
    expect(out?.mapping).toEqual([p(5, 70)]);
    expect(out?.pending).toEqual([]);
  });

  it("moves a link that is not settled", () => {
    const state = { ...withPending(question()), mapping: [p(8, 50)] };
    expect(chooseCandidate(state, "naka", 5, 50)?.mapping).toEqual([p(5, 50)]);
  });

  it("refuses a product held by a settled pair of another title", () => {
    const state = { ...withPending(question()), settled: [p(8, 50)] };
    expect(chooseCandidate(state, "naka", 5, 50)).toBeUndefined();
  });

  it("refuses a title held by a settled pair with another product: a settled {5, 60} next to a new {5, 50} (Ruling 5)", () => {
    const state = {
      ...withPending(question()),
      mapping: [p(5, 60)],
      settled: [p(5, 60)],
    };
    expect(chooseCandidate(state, "naka", 5, 50)).toBeUndefined();
  });

  it("accepts the settled pair itself", () => {
    const state = { ...withPending(question()), settled: [p(5, 50)] };
    expect(chooseCandidate(state, "naka", 5, 50)?.mapping).toEqual([p(5, 50)]);
  });
});

describe("chooseNone", () => {
  it("empties both lists and keeps title, asked and finish", () => {
    const q = question({ asked: true, finish: "movie:5" });
    const out = chooseNone(withPending(q), "naka", 5);
    expect(out?.pending).toStrictEqual([
      {
        kind: "ambiguity",
        side: "naka",
        id: 5,
        candidateIds: [],
        candidates: [],
        title: "Dune",
        asked: true,
        finish: "movie:5",
      },
    ]);
    expect(out?.unlinked).toEqual([]);
  });

  it("is undefined without an open question", () => {
    expect(chooseNone(emptyState(), "naka", 5)).toBeUndefined();
  });
});

describe("keepPair and closeRemoval", () => {
  const state: SyncState = {
    ...withPending(
      removal("sc", p(3, 4)),
      removal("naka", p(3, 4)),
      removal("sc", p(3, 5)),
    ),
    mapping: [p(3, 4)],
  };

  it("keepPair settles the pair and closes both removals of it", () => {
    const out = keepPair(state, p(3, 4));
    expect(out.settled).toEqual([p(3, 4)]);
    expect(out.pending).toEqual([removal("sc", p(3, 5))]);
    expect(out.mapping).toEqual([p(3, 4)]);
  });

  it("closeRemoval closes them without settling", () => {
    const out = closeRemoval(state, p(3, 4));
    expect(out.settled).toEqual([]);
    expect(out.pending).toEqual([removal("sc", p(3, 5))]);
  });
});

describe("linkByHand", () => {
  const unlinked = {
    side: "naka",
    id: 5,
    title: "Dune",
    reason: "no-match",
  } as const;

  it("maps an unlinked entry and drops it", () => {
    const state = { ...emptyState(), unlinked: [unlinked] };
    const out = linkByHand(state, "naka", 5, 50);
    expect(out?.mapping).toEqual([p(5, 50)]);
    expect(out?.unlinked).toEqual([]);
  });

  it("maps an open ambiguity (a none question) and closes it", () => {
    const state = withPending(question({ candidateIds: [], candidates: [] }));
    const out = linkByHand(state, "naka", 5, 99);
    expect(out?.mapping).toEqual([p(5, 99)]);
    expect(out?.pending).toEqual([]);
  });

  it("is undefined on nothing", () => {
    expect(linkByHand(emptyState(), "naka", 5, 50)).toBeUndefined();
  });

  it("is undefined for a title held by a settled pair: a settled {5, 60} next to a new {5, 50} (Ruling 5)", () => {
    const state = {
      ...emptyState(),
      unlinked: [unlinked],
      settled: [p(5, 60)],
    };
    expect(linkByHand(state, "naka", 5, 50)).toBeUndefined();
  });

  it("is undefined for a product held by a settled pair", () => {
    const state = {
      ...emptyState(),
      unlinked: [unlinked],
      settled: [p(8, 50)],
    };
    expect(linkByHand(state, "naka", 5, 50)).toBeUndefined();
  });
});

describe("dropLegacy", () => {
  it("drops a question without candidates", () => {
    const legacy: AmbiguityItem = {
      kind: "ambiguity",
      side: "naka",
      id: 5,
      candidateIds: [1005, 2005],
    };
    expect(dropLegacy(withPending(legacy), "naka", 5)?.pending).toEqual([]);
  });

  it("refuses a question that has candidates", () => {
    expect(dropLegacy(withPending(question()), "naka", 5)).toBeUndefined();
    const none = question({ candidateIds: [], candidates: [] });
    expect(dropLegacy(withPending(none), "naka", 5)).toBeUndefined();
  });
});

describe("withFinish", () => {
  it("sets the finish on the open naka-side question", () => {
    const out = withFinish(withPending(question()), 5, "tv:5:S1E2");
    expect(out.pending).toEqual([question({ finish: "tv:5:S1E2" })]);
  });

  it("changes nothing without a question, or on a sc-side one", () => {
    const sc = withPending(question({ side: "sc" }));
    expect(withFinish(sc, 5, "movie:5")).toEqual(sc);
    expect(withFinish(emptyState(), 5, "movie:5")).toEqual(emptyState());
  });
});

describe("idsOfKey", () => {
  it("reads an episode and a film key", () => {
    expect(idsOfKey("tv:12:S1E2")).toStrictEqual({
      contentId: 12,
      season: 1,
      episode: 2,
    });
    expect(idsOfKey("movie:12")).toStrictEqual({ contentId: 12 });
  });

  it.each(["x", "", "movie:", "tv:1:S1", "movie:1 ", "tv:1:S1E2x"])(
    "refuses %j",
    (key) => {
      expect(idsOfKey(key)).toBeUndefined();
    },
  );
});
