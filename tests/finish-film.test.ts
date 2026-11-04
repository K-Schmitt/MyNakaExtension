import { describe, expect, it } from "vitest";
import { handleFinish } from "../src/core/finish-handler";
import { emptyState } from "../src/core/state";
import { DEFAULT_THRESHOLDS } from "../src/core/watch-trigger";
import {
  cand,
  episode,
  FILM,
  FILM_PAIR,
  FILM_SC,
  FILM_TITLE,
  failure,
  film,
  type Port,
  SERIES,
  SERIES_PAIR,
  world,
  writesOf,
} from "./finish-fakes";

const state1 = {
  ...emptyState(),
  mapping: [FILM_PAIR],
  settled: [FILM_PAIR],
};

// Every {isDone, isWished} row, with the writes it calls for (today() only before a markDone).
const ROWS: [boolean, boolean, string[]][] = [
  [false, true, ["unwish:1042", "today", "markDone:1042:2026-11-03"]],
  [false, false, ["today", "markDone:1042:2026-11-03"]],
  [true, true, ["unwish:1042"]],
  [true, false, []],
];

describe("film", () => {
  it.each(ROWS)(
    "isDone %s, isWished %s: reads the state, saves the settled pair, then calls %j, then saves it handled",
    async (isDone, isWished, writes) => {
      const w = world({ flags: { [FILM_SC]: { isDone, isWished } } });
      expect(
        (await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS)).kind,
      ).toBe("done");
      expect(w.calls).toEqual([
        "load",
        "searchSc:Le Film",
        "productState:1042",
        "save",
        ...writes,
        "save",
      ]);
      expect(w.saved).toStrictEqual([
        state1,
        { ...state1, handled: ["movie:42"] },
      ]);
    },
  );

  it("the default film is wished and not done: done with a film target", async () => {
    const w = world();
    expect(await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS)).toEqual({
      kind: "done",
      ratingTargets: [{ label: "film", productId: FILM_SC, current: null }],
    });
  });

  it("a second event for the same film writes nothing: the date is not rewritten", async () => {
    const w = world();
    await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS);
    const before = w.calls.length;
    expect(
      await handleFinish(
        film({ source: "explicit" }),
        w.ports,
        DEFAULT_THRESHOLDS,
      ),
    ).toEqual({
      kind: "ignored",
      reason: "already-handled",
    });
    expect(w.calls.slice(before)).toEqual(["load"]);
    expect(writesOf(w.calls)).toEqual([
      "unwish:1042",
      "markDone:1042:2026-11-03",
    ]);
  });

  it.each([
    [false, true, ["unwish:1042", "markDone:1042:2026-11-03"]],
    [false, false, ["markDone:1042:2026-11-03"]],
    [true, true, ["unwish:1042"]],
    [true, false, []],
  ])(
    "isDone %s, isWished %s: writes %j, and always returns the film target",
    async (isDone, isWished, writes) => {
      const w = world({ flags: { [FILM_SC]: { isDone, isWished } } });
      expect(await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS)).toEqual({
        kind: "done",
        ratingTargets: [{ label: "film", productId: FILM_SC, current: null }],
      });
      expect(writesOf(w.calls)).toEqual(writes);
      expect(w.calls.includes("today")).toBe(!isDone);
      expect(w.state.handled).toEqual(["movie:42"]);
      expect(w.state.settled).toEqual([FILM_PAIR]);
    },
  );

  it("a film already done with a rating of 6 is not rewritten and returns its target with 6", async () => {
    const w = world({
      flags: { [FILM_SC]: { isDone: true, isWished: false, rating: 6 } },
    });
    expect(await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS)).toEqual({
      kind: "done",
      ratingTargets: [{ label: "film", productId: FILM_SC, current: 6 }],
    });
    expect(writesOf(w.calls)).toEqual([]);
    expect(w.calls).not.toContain("today");
  });

  it("a film just marked done carries the rating the state reported", async () => {
    const w = world({
      flags: { [FILM_SC]: { isDone: false, isWished: true, rating: 9 } },
    });
    const outcome = await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS);
    expect(outcome).toEqual({
      kind: "done",
      ratingTargets: [{ label: "film", productId: FILM_SC, current: 9 }],
    });
  });

  it("a film outcome has no lastOfSeason key", async () => {
    const w = world();
    const outcome = await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS);
    expect("lastOfSeason" in outcome).toBe(false);
  });

  it("a mapped film is not searched and its mapping is kept as is", async () => {
    const w = world({ state: { mapping: [FILM_PAIR, SERIES_PAIR] } });
    await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS);
    expect(w.calls.some((c) => c.startsWith("searchSc"))).toBe(false);
    expect(w.saved[0]?.mapping).toEqual([FILM_PAIR, SERIES_PAIR]);
    expect(w.saved[0]?.settled).toEqual([FILM_PAIR]);
  });

  it("an already settled pair is not settled twice", async () => {
    const w = world({ state: { mapping: [FILM_PAIR], settled: [FILM_PAIR] } });
    await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS);
    expect(w.state.settled).toEqual([FILM_PAIR]);
  });

  it("a rejected productState rejects with no save and no write", async () => {
    const w = world({ fail: ["productState"] });
    expect(
      (await failure(handleFinish(film(), w.ports, DEFAULT_THRESHOLDS)))
        .message,
    ).toBe("productState failed");
    expect(w.calls).toEqual(["load", "searchSc:Le Film", "productState:1042"]);
    expect(w.saved).toEqual([]);
  });

  it.each(ROWS)(
    "isDone %s, isWished %s: a rejected first save rejects with no write",
    async (isDone, isWished) => {
      const w = world({
        failSave: [1],
        flags: { [FILM_SC]: { isDone, isWished } },
      });
      expect(
        (await failure(handleFinish(film(), w.ports, DEFAULT_THRESHOLDS)))
          .message,
      ).toBe("save failed");
      expect(w.calls).toEqual([
        "load",
        "searchSc:Le Film",
        "productState:1042",
        "save",
      ]);
      expect(writesOf(w.calls)).toEqual([]);
      expect(w.saved).toEqual([]);
    },
  );

  it.each([
    [
      "mapped to a series product",
      { mapping: [SERIES_PAIR] },
      SERIES,
      {},
      1007,
    ],
    [
      "found by search as a series product",
      {},
      FILM,
      { "Le Film": [cand(2007, FILM_TITLE)] },
      2007,
    ],
    [
      "found by search as an episode product",
      {},
      FILM,
      { "Le Film": [cand(5001, FILM_TITLE)] },
      5001,
    ],
  ])(
    "a film event whose product is %s rejects before any save or write",
    async (_name, state, contentId, search, scId) => {
      const w = world({ state, search });
      const event = film({
        source: "explicit",
        naka: { contentId, mediaType: "movie" },
      });
      const error = await failure(
        handleFinish(event, w.ports, DEFAULT_THRESHOLDS),
      );
      expect(error.constructor).toBe(Error);
      expect(error.message).toBe(
        "finish: the SensCritique product is not a film",
      );
      expect(w.calls.slice(-1)).toEqual([`productState:${scId}`]);
      expect(writesOf(w.calls)).toEqual([]);
      expect(w.saved).toEqual([]);
    },
  );

  it.each([
    ["unwish", { fail: ["unwish"] as Port[] }, ["unwish:1042"]],
    [
      "markDone",
      { fail: ["markDone"] as Port[] },
      ["unwish:1042", "markDone:1042:2026-11-03"],
    ],
    [
      "the second save",
      { failSave: [2] },
      ["unwish:1042", "markDone:1042:2026-11-03"],
    ],
  ])(
    "when %s rejects, the handler rejects and leaves the pair mapped and settled, not handled",
    async (_name, opts, writes) => {
      const w = world(opts);
      await failure(handleFinish(film(), w.ports, DEFAULT_THRESHOLDS));
      expect(writesOf(w.calls)).toEqual(writes);
      expect(w.saved).toStrictEqual([state1]);
      expect(w.state).toStrictEqual(state1);
    },
  );
});

describe("the loaded state is never mutated", () => {
  it.each([
    ["a film found by search", film(), {}],
    ["a mapped film", film(), { mapping: [FILM_PAIR] }],
    ["an episode", episode(1, 2), {}],
    ["an ambiguous film", film(), { mapping: [{ nakaId: 99, scId: FILM_SC }] }],
  ])("%s", async (_name, event, state) => {
    const w = world({ state });
    const loaded = w.state;
    const copy = structuredClone(loaded);
    await handleFinish(event, w.ports, DEFAULT_THRESHOLDS);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(loaded).toStrictEqual(copy);
  });
});

describe("film threshold", () => {
  it("a film at 0.85 under the default thresholds is ignored and nothing is saved", async () => {
    const w = world();
    const outcome = await handleFinish(
      film({ progress: 0.85 }),
      w.ports,
      DEFAULT_THRESHOLDS,
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "below-threshold" });
    expect(w.calls).toEqual(["load"]);
    expect(w.saved).toEqual([]);
  });

  it("a film at 0.9 is marked done", async () => {
    const w = world();
    const outcome = await handleFinish(
      film({ progress: 0.9 }),
      w.ports,
      DEFAULT_THRESHOLDS,
    );
    expect(outcome.kind).toBe("done");
  });
});
