import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import { emptyState, type SyncState } from "../src/core/state";
import { parseState } from "../src/ext/state-schema";
import { StoredStateError } from "../src/ext/stored-error";

const MARK = "SECRET-MARKER";
const p = (nakaId: number, scId: number): Pair => ({ nakaId, scId });
const e = (id: number, from: number, to: number) => ({ id, from, to });

function valid(): SyncState {
  return {
    version: 1,
    mapping: [p(1, 10), p(2, 20), p(3, 30)],
    snapshot: [p(1, 10)],
    settled: [p(2, 20)],
    pending: [
      { kind: "removal", removeFrom: "sc", pair: p(3, 30), asked: false },
      { kind: "ambiguity", side: "naka", id: 9, candidateIds: [90, 91] },
    ],
    handled: ["movie:5", "tv:7:S1E2"],
    unlinked: [{ side: "sc", id: 4, title: "A title", reason: "no-match" }],
    retryLast: [p(3, 30)],
    run: 5,
    presence: {
      naka: [e(1, 1, 2), e(2, 1, 5), e(1, 4, 5)],
      sc: [e(10, 1, 5), e(20, 2, 3), e(20, 5, 5)],
    },
    threshold: 0.9,
  };
}

function rejection(raw: unknown): unknown {
  try {
    parseState(raw);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("parseState accepts", () => {
  it("a full valid state, unchanged", () => {
    expect(parseState(valid())).toEqual(valid());
  });

  it("an unlinked item that is not in the catalogue", () => {
    const state = {
      ...valid(),
      unlinked: [
        { side: "naka", id: 8, title: "", reason: "not-in-catalogue" },
      ],
    };
    expect(parseState(state)).toEqual(state);
  });

  it("an empty state", () => {
    expect(parseState(emptyState())).toEqual(emptyState());
  });

  it("a state that went through JSON", () => {
    expect(parseState(JSON.parse(JSON.stringify(valid())))).toEqual(valid());
  });

  it("several disjoint intervals of one id, interleaved with other ids", () => {
    const state = {
      ...valid(),
      run: 9,
      presence: {
        naka: [e(1, 1, 2), e(2, 1, 9), e(1, 3, 3), e(1, 5, 9)],
        sc: [],
      },
    };
    expect(parseState(state)).toEqual(state);
  });

  it("handled keys of movies and episodes with several digits", () => {
    const state = { ...valid(), handled: ["movie:123", "tv:12:S10E200"] };
    expect(parseState(state)).toEqual(state);
  });

  it("an interval that starts right after the previous one of its id", () => {
    const presence = { naka: [e(1, 1, 2), e(1, 3, 4)], sc: [] };
    expect(parseState({ ...valid(), presence })).toEqual({
      ...valid(),
      presence,
    });
  });

  it("the same id on both sides, each with its own intervals", () => {
    const presence = { naka: [e(1, 1, 3)], sc: [e(1, 1, 5)] };
    expect(parseState({ ...valid(), presence })).toEqual({
      ...valid(),
      presence,
    });
  });

  it("an interval ending at run, and a threshold of exactly 1", () => {
    const state = { ...valid(), threshold: 1 };
    expect(parseState(state)).toEqual(state);
  });

  it("the smallest positive threshold", () => {
    const state = { ...valid(), threshold: Number.MIN_VALUE };
    expect(parseState(state)).toEqual(state);
  });

  it("run 0 with no presence", () => {
    const state = { ...valid(), run: 0, presence: { naka: [], sc: [] } };
    expect(parseState(state)).toEqual(state);
  });

  it("returns a new object, not the input", () => {
    const input = valid();
    expect(parseState(input)).not.toBe(input);
  });
});

type Bad = { name: string; patch: Record<string, unknown>; path: string };

const bad = (name: string, path: string, patch: Record<string, unknown>) => ({
  name,
  path,
  patch,
});

const BAD_CASES: Bad[] = [
  bad("version 2", "version", { version: 2 }),
  bad("version as a string", "version", { version: MARK }),
  bad("mapping not an array", "mapping", { mapping: MARK }),
  bad("mapping entry not an object", "mapping[1]", {
    mapping: [p(1, 10), MARK],
  }),
  bad("mapping entry null", "mapping[0]", { mapping: [null] }),
  bad("mapping nakaId 0", "mapping[1].nakaId", {
    mapping: [p(1, 10), p(0, 20)],
  }),
  bad("mapping scId negative", "mapping[0].scId", { mapping: [p(1, -1)] }),
  bad("mapping nakaId fractional", "mapping[0].nakaId", {
    mapping: [p(1.5, 10)],
  }),
  bad("mapping scId as a string", "mapping[0].scId", {
    mapping: [{ nakaId: 1, scId: MARK }],
  }),
  bad("mapping nakaId unsafe", "mapping[0].nakaId", {
    mapping: [p(2 ** 53, 10)],
  }),
  bad("mapping nakaId NaN", "mapping[0].nakaId", {
    mapping: [p(Number.NaN, 1)],
  }),
  bad("mapping pair with an extra key", "mapping[0]", {
    mapping: [{ nakaId: 1, scId: 10, [MARK]: 1 }],
  }),
  bad("mapping pair missing scId", "mapping[0].scId", {
    mapping: [{ nakaId: 1 }],
  }),
  bad("mapping repeats a naka id", "mapping[1].nakaId", {
    mapping: [p(1, 10), p(1, 20)],
  }),
  bad("mapping repeats a sc id", "mapping[2].scId", {
    mapping: [p(1, 10), p(2, 20), p(3, 10)],
  }),
  bad("snapshot not an array", "snapshot", { snapshot: {} }),
  bad("snapshot id 0", "snapshot[1].scId", { snapshot: [p(1, 1), p(2, 0)] }),
  bad("settled id fractional", "settled[0].nakaId", { settled: [p(0.5, 1)] }),
  bad("settled missing", "settled", { settled: undefined }),
  bad("retryLast id negative", "retryLast[0].nakaId", {
    retryLast: [p(-3, 1)],
  }),
  bad("retryLast not an array", "retryLast", { retryLast: null }),
  bad("pending not an array", "pending", { pending: MARK }),
  bad("pending unknown kind", "pending[0].kind", {
    pending: [{ kind: MARK, side: "naka", id: 1, candidateIds: [] }],
  }),
  bad("pending item not an object", "pending[0]", { pending: [7] }),
  bad("removal side unknown", "pending[0].removeFrom", {
    pending: [
      { kind: "removal", removeFrom: MARK, pair: p(1, 2), asked: true },
    ],
  }),
  bad("removal asked not a boolean", "pending[0].asked", {
    pending: [{ kind: "removal", removeFrom: "sc", pair: p(1, 2), asked: 1 }],
  }),
  bad("removal pair invalid", "pending[0].pair.scId", {
    pending: [
      { kind: "removal", removeFrom: "sc", pair: p(1, 0), asked: false },
    ],
  }),
  bad("removal with an extra key", "pending[0]", {
    pending: [
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(1, 2),
        asked: false,
        [MARK]: 1,
      },
    ],
  }),
  bad("ambiguity side unknown", "pending[0].side", {
    pending: [{ kind: "ambiguity", side: MARK, id: 1, candidateIds: [] }],
  }),
  bad("ambiguity id 0", "pending[0].id", {
    pending: [{ kind: "ambiguity", side: "sc", id: 0, candidateIds: [] }],
  }),
  bad("ambiguity candidates not an array", "pending[0].candidateIds", {
    pending: [{ kind: "ambiguity", side: "sc", id: 1, candidateIds: MARK }],
  }),
  bad("ambiguity candidate id invalid", "pending[0].candidateIds[1]", {
    pending: [{ kind: "ambiguity", side: "sc", id: 1, candidateIds: [4, 0] }],
  }),
  bad("ambiguity with an extra key", "pending[0]", {
    pending: [
      { kind: "ambiguity", side: "sc", id: 1, candidateIds: [], [MARK]: 1 },
    ],
  }),
  bad("handled not an array", "handled", { handled: MARK }),
  bad("handled key not a string", "handled[0]", { handled: [5] }),
  bad("handled key x", "handled[1]", { handled: ["movie:1", "x"] }),
  bad("handled key without id", "handled[0]", { handled: ["movie:"] }),
  bad("handled episode without episode", "handled[0]", {
    handled: ["tv:1:S2"],
  }),
  bad("handled key with a trailing newline", "handled[0]", {
    handled: ["movie:1\n"],
  }),
  bad("handled episode with an empty episode", "handled[0]", {
    handled: ["tv:1:S2E"],
  }),
  bad("handled episode with an empty season", "handled[0]", {
    handled: ["tv:1:SE3"],
  }),
  bad("handled episode with an empty id", "handled[0]", {
    handled: ["tv::S1E1"],
  }),
  bad("handled episode with a suffix", "handled[0]", {
    handled: ["tv:1:S1E1x"],
  }),
  bad("handled movie with a decimal id", "handled[0]", {
    handled: ["movie:1.5"],
  }),
  bad("handled movie with a negative id", "handled[0]", {
    handled: ["movie:-1"],
  }),
  bad("handled movie with a non-ASCII digit", "handled[0]", {
    handled: ["movie:١"],
  }),
  bad("handled movie in upper case", "handled[0]", { handled: ["MOVIE:1"] }),
  bad("handled key with a prefix", "handled[0]", {
    handled: [`${MARK}movie:1`],
  }),
  bad("unlinked not an array", "unlinked", { unlinked: MARK }),
  bad("unlinked side unknown", "unlinked[0].side", {
    unlinked: [{ side: MARK, id: 1, title: "t", reason: "no-match" }],
  }),
  bad("unlinked id 0", "unlinked[0].id", {
    unlinked: [{ side: "sc", id: 0, title: "t", reason: "no-match" }],
  }),
  bad("unlinked title not a string", "unlinked[0].title", {
    unlinked: [{ side: "sc", id: 1, title: 4, reason: "no-match" }],
  }),
  bad("unlinked reason unknown", "unlinked[0].reason", {
    unlinked: [{ side: "sc", id: 1, title: "t", reason: MARK }],
  }),
  bad("unlinked with an extra key", "unlinked[0]", {
    unlinked: [
      { side: "sc", id: 1, title: "t", reason: "no-match", [MARK]: 1 },
    ],
  }),
  bad("run -1", "run", { run: -1 }),
  bad("run 1.5", "run", { run: 1.5 }),
  bad("run missing", "run", { run: undefined }),
  bad("run as a string", "run", { run: MARK }),
  bad("run NaN", "run", { run: Number.NaN }),
  bad("run unsafe", "run", { run: 2 ** 53 }),
  bad("threshold 0", "threshold", { threshold: 0 }),
  bad("threshold 1.1", "threshold", { threshold: 1.1 }),
  bad("threshold negative", "threshold", { threshold: -0.5 }),
  bad("threshold NaN", "threshold", { threshold: Number.NaN }),
  bad("threshold as a string", "threshold", { threshold: MARK }),
  bad("threshold as a numeric string", "threshold", { threshold: "0.5" }),
  bad("threshold missing", "threshold", { threshold: undefined }),
  bad("presence not an object", "presence", { presence: MARK }),
  bad("presence side missing", "presence.sc", { presence: { naka: [] } }),
  bad("presence with an extra key", "presence", {
    presence: { naka: [], sc: [], [MARK]: [] },
  }),
  bad("presence side not an array", "presence.naka", {
    presence: { naka: MARK, sc: [] },
  }),
  bad("presence entry id 0", "presence.sc[0].id", {
    presence: { naka: [], sc: [e(0, 1, 1)] },
  }),
  bad("presence entry from 0", "presence.naka[0].from", {
    presence: { naka: [e(1, 0, 1)], sc: [] },
  }),
  bad("presence entry from fractional", "presence.naka[0].from", {
    presence: { naka: [e(1, 1.5, 2)], sc: [] },
  }),
  bad("presence entry to as a string", "presence.naka[0].to", {
    presence: { naka: [{ id: 1, from: 1, to: MARK }], sc: [] },
  }),
  bad("presence entry with an extra key", "presence.naka[0]", {
    presence: { naka: [{ id: 1, from: 1, to: 1, [MARK]: 1 }], sc: [] },
  }),
  bad("presence from after to", "presence.naka[0].to", {
    presence: { naka: [e(1, 3, 2)], sc: [] },
  }),
  bad("presence to above run", "presence.sc[0].to", {
    presence: { naka: [], sc: [e(1, 1, 6)] },
  }),
  bad("presence naka to above run", "presence.naka[0].to", {
    presence: { naka: [e(1, 1, 6)], sc: [] },
  }),
  bad("handled key wrapped in an array", "handled[0]", {
    handled: [["movie:1"]],
  }),
  bad("presence unsorted intervals of one id", "presence.naka[1].from", {
    presence: { naka: [e(1, 4, 5), e(1, 1, 2)], sc: [] },
  }),
  bad("presence overlapping intervals of one id", "presence.naka[1].from", {
    presence: { naka: [e(1, 1, 3), e(1, 3, 5)], sc: [] },
  }),
  bad("presence nested intervals of one id", "presence.sc[2].from", {
    presence: { naka: [], sc: [e(1, 1, 5), e(2, 1, 1), e(1, 2, 3)] },
  }),
  bad("presence duplicate entry", "presence.naka[1].from", {
    presence: { naka: [e(1, 2, 3), e(1, 2, 3)], sc: [] },
  }),
  bad("presence entries must be an array of objects", "presence.naka[0]", {
    presence: { naka: [MARK], sc: [] },
  }),
];

describe("parseState rejects", () => {
  it("has at least 30 invalid cases", () => {
    expect(BAD_CASES.length).toBeGreaterThanOrEqual(30);
  });

  it.each(BAD_CASES)("$name", ({ patch, path }) => {
    const error = rejection({ ...valid(), ...patch });
    expect(error).toBeInstanceOf(StoredStateError);
    expect((error as Error).message).toBe(`stored state: ${path}`);
    expect((error as Error).message).not.toContain(MARK);
  });

  it("a state with an unknown top-level key, without naming it", () => {
    const error = rejection({ ...valid(), [MARK]: 1 });
    expect(error).toBeInstanceOf(StoredStateError);
    expect((error as Error).message).toBe("stored state: state");
  });

  it("a state missing a top-level key", () => {
    const { handled: _omitted, ...rest } = valid();
    const error = rejection(rest);
    expect((error as Error).message).toBe("stored state: handled");
  });

  it.each([
    ["null", null],
    ["a string", MARK],
    ["an array", []],
    ["a number", 3],
    ["undefined", undefined],
  ])("%s as the whole state", (_name, raw) => {
    const error = rejection(raw);
    expect(error).toBeInstanceOf(StoredStateError);
    expect((error as Error).message).toBe("stored state: state");
  });

  it("a hole in an array", () => {
    const mapping = [p(1, 10)];
    mapping[2] = p(3, 30);
    const error = rejection({ ...valid(), mapping });
    expect((error as Error).message).toBe("stored state: mapping[1]");
  });
});

describe("parseState and the titles of a question", () => {
  const withPending = (...pending: unknown[]) => ({ ...emptyState(), pending });
  const q = (extra: Record<string, unknown> = {}) => ({
    kind: "ambiguity",
    side: "naka",
    id: 5,
    candidateIds: [1005, 2005],
    ...extra,
  });
  const c = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    title: `T${id}`,
    type: "film",
    ...extra,
  });
  const messageOf = (state: unknown): string =>
    (rejection(state) as Error).message;

  it("the exact 4a question parses and has no candidates", () => {
    const state = withPending(q());
    const out = parseState(state);
    expect(out).toEqual(state);
    expect(out.pending[0]).not.toHaveProperty("candidates");
  });

  it("the exact 4a removal parses", () => {
    const state = withPending({
      kind: "removal",
      removeFrom: "sc",
      pair: { nakaId: 21391, scId: 112240873 },
      asked: false,
    });
    expect(parseState(state)).toEqual(state);
  });

  it("a full new question round-trips, equal", () => {
    const state = withPending(
      q({
        asked: true,
        title: "Dune",
        candidateIds: [1, 2],
        candidates: [c(1, { year: 1800 }), c(2, { type: "serie", year: 2100 })],
        finish: "tv:5:S1E2",
      }),
      {
        kind: "removal",
        removeFrom: "naka",
        pair: p(3, 4),
        asked: true,
        title: "Un Job",
      },
    );
    expect(parseState(JSON.parse(JSON.stringify(state)))).toStrictEqual(state);
  });

  it("an empty candidates list with empty ids parses (a none question)", () => {
    const state = withPending(q({ candidateIds: [], candidates: [] }));
    expect(parseState(state)).toEqual(state);
  });

  it("asked: false on a question is refused", () => {
    expect(messageOf(withPending(q({ asked: false })))).toBe(
      "stored state: pending[0].asked",
    );
  });

  it("candidates whose ids differ from candidateIds are refused", () => {
    const state = withPending(q({ candidateIds: [2], candidates: [c(1)] }));
    expect(messageOf(state)).toBe("stored state: pending[0].candidates");
  });

  it("the same ids in another order are refused", () => {
    const state = withPending(
      q({ candidateIds: [2, 1], candidates: [c(1), c(2)] }),
    );
    expect(messageOf(state)).toBe("stored state: pending[0].candidates");
  });

  it("21 candidates are refused, 20 are accepted", () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => c(i + 1));
    const ids = (n: number) => list(n).map((x) => x.id);
    const ok = withPending(q({ candidateIds: ids(20), candidates: list(20) }));
    expect(parseState(ok)).toEqual(ok);
    const tooMany = withPending(
      q({ candidateIds: ids(21), candidates: list(21) }),
    );
    expect(messageOf(tooMany)).toBe("stored state: pending[0].candidates");
  });

  it.each([
    ["a year below 1800", { year: 1799 }],
    ["a year above 2100", { year: 2101 }],
    ["a fractional year", { year: 2000.5 }],
    ["an unknown type", { type: "book" }],
    ["an extra key", { originalTitle: "x" }],
    ["a title that is not a string", { title: 3 }],
  ])("a candidate with %s is refused", (_name, extra) => {
    const state = withPending(
      q({ candidateIds: [1], candidates: [c(1, extra)] }),
    );
    expect(messageOf(state)).toMatch(/^stored state: pending\[0\]\.candidates/);
  });

  it("a title that is not a string is refused", () => {
    expect(messageOf(withPending(q({ title: 3 })))).toBe(
      "stored state: pending[0].title",
    );
  });

  it("a finish for another contentId is refused", () => {
    expect(messageOf(withPending(q({ finish: "tv:6:S1E1" })))).toBe(
      "stored state: pending[0].finish",
    );
  });

  it("a malformed finish is refused", () => {
    expect(messageOf(withPending(q({ finish: "nope" })))).toBe(
      "stored state: pending[0].finish",
    );
  });

  it("a finish on a sc-side question is refused, even for its own id", () => {
    const state = withPending(q({ side: "sc", finish: "tv:5:S1E1" }));
    expect(messageOf(state)).toBe("stored state: pending[0].finish");
  });

  it("a finish for the question's own id on the naka side parses", () => {
    const state = withPending(q({ finish: "movie:5" }));
    expect(parseState(state)).toEqual(state);
  });

  it("a removal title that is not a string is refused", () => {
    const state = withPending({
      kind: "removal",
      removeFrom: "sc",
      pair: p(1, 2),
      asked: false,
      title: 7,
    });
    expect(messageOf(state)).toBe("stored state: pending[0].title");
  });
});

describe("parseState handledTitles", () => {
  const titled = { ...valid(), handledTitles: { "movie:5": "Un film" } };

  it("is optional: the owner's state without it parses unchanged", () => {
    expect(parseState(valid())).not.toHaveProperty("handledTitles");
  });

  it("is kept when valid", () => {
    expect(parseState(titled)).toEqual(titled);
    expect(parseState(JSON.parse(JSON.stringify(titled)))).toEqual(titled);
  });

  it.each([
    ["not an object", "x"],
    ["a list", ["movie:5"]],
    ["a bad key", { "film 5": "x" }],
    ["a title that is not text", { "movie:5": 3 }],
    ["a null title", { "movie:5": null }],
  ])("rejects %s, naming the field and not the value", (_name, raw) => {
    const error = rejection({ ...valid(), handledTitles: raw });
    expect(error).toBeInstanceOf(StoredStateError);
    expect((error as Error).message).toMatch(/^stored state: handledTitles/);
  });
});

describe("parseState retryFinishes", () => {
  const question = {
    kind: "ambiguity",
    side: "naka",
    id: 5,
    candidateIds: [50, 51],
  };
  const good = {
    key: "movie:5",
    pair: p(5, 50),
    evicted: [p(7, 70)],
    question,
    at: 1000,
  };
  const withRetries = (retryFinishes: unknown) => ({
    ...valid(),
    retryFinishes,
  });

  it("is optional: a state without it parses with no such field", () => {
    expect(parseState(valid())).not.toHaveProperty("retryFinishes");
  });

  it("round-trips a valid entry", () => {
    const state = withRetries([good]);
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("round-trips linkedBefore: true", () => {
    const state = withRetries([{ ...good, linkedBefore: true }]);
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it.each([
    ["a bad content key", { ...good, key: "film 5" }],
    ["linkedBefore false", { ...good, linkedBefore: false }],
    ["linkedBefore not a boolean", { ...good, linkedBefore: 1 }],
    [
      "a removal question",
      {
        ...good,
        question: {
          kind: "removal",
          removeFrom: "sc",
          pair: p(5, 50),
          asked: false,
        },
      },
    ],
    [
      "a question holding finish",
      { ...good, question: { ...question, finish: "movie:5" } },
    ],
    ["an unknown entry key", { ...good, extra: 1 }],
  ])("rejects %s, naming retryFinishes", (_name, bad) => {
    const error = rejection(withRetries([bad]));
    expect(error).toBeInstanceOf(StoredStateError);
    expect((error as Error).message).toMatch(/^stored state: retryFinishes/);
  });

  it("rejects more than 20 entries", () => {
    const many = Array.from({ length: 21 }, (_v, i) => ({
      ...good,
      key: `movie:${i + 1}`,
    }));
    const error = rejection(withRetries(many));
    expect(error).toBeInstanceOf(StoredStateError);
    expect((error as Error).message).toMatch(/^stored state: retryFinishes/);
  });
});

describe("parseState images", () => {
  const image = { posterPath: "/a.jpg", picture: "https://any.example/p.jpg" };
  const candidate = { id: 90, title: "A", type: "film" as const };

  it("round-trips a candidate and a removal with an image", () => {
    const state = valid();
    state.pending = [
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(3, 30),
        asked: false,
        title: "T",
        image,
      },
      {
        kind: "ambiguity",
        side: "naka",
        id: 9,
        candidateIds: [90],
        candidates: [{ ...candidate, image }],
      },
    ];
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("reads items without an image exactly as before", () => {
    const state = valid();
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("rejects an image of the wrong shape", () => {
    const state = valid();
    state.pending = [
      {
        kind: "removal",
        removeFrom: "sc",
        pair: p(3, 30),
        asked: false,
        image: { posterPath: "nope" },
      },
    ];
    expect(rejection(JSON.parse(JSON.stringify(state)))).toBeInstanceOf(
      StoredStateError,
    );
  });
});
