import { describe, expect, it } from "vitest";
import { handleFinish } from "../src/core/finish-handler";
import { emptyState } from "../src/core/state";
import { DEFAULT_THRESHOLDS } from "../src/core/watch-trigger";
import {
  ep,
  episode,
  failure,
  type Port,
  SEASON1_SC,
  SERIES_PAIR,
  SERIES_SC,
  TODAY,
  world,
  writesOf,
} from "./finish-fakes";

describe("episode", () => {
  it.each([
    ["a film", 1042],
    ["a series", 2007],
  ])(
    "an episode whose product is %s rejects with no write and nothing saved",
    async (_name, productId) => {
      const seasons = {
        [`${SERIES_SC}:1`]: {
          seasonProductId: SEASON1_SC,
          episodes: [ep(1, 2, productId)],
        },
      };
      const w = world({ seasons });
      const error = await failure(
        handleFinish(episode(1, 2), w.ports, DEFAULT_THRESHOLDS),
      );
      expect(error.constructor).toBe(Error);
      expect(error.message).toBe(
        "finish: the SensCritique product is not an episode",
      );
      expect(w.calls.slice(-1)).toEqual([`productState:${productId}`]);
      expect(writesOf(w.calls)).toEqual([]);
      expect(w.saved).toEqual([]);
    },
  );

  it("marks the episode done, never unwishes, saves once with the new mapping", async () => {
    const w = world();
    expect(
      await handleFinish(episode(1, 2), w.ports, DEFAULT_THRESHOLDS),
    ).toEqual({
      kind: "done",
      ratingTargets: [
        { label: "épisode", productId: 5002 },
        { label: "saison", productId: SEASON1_SC },
        { label: "série", productId: SERIES_SC },
      ],
    });
    expect(w.calls).toEqual([
      "load",
      "searchSc:La Série",
      "seasonInfo:1007:1",
      "productState:5002",
      "today",
      "markDone:5002:2026-11-03",
      "save",
    ]);
    expect(w.saved).toStrictEqual([
      { ...emptyState(), mapping: [SERIES_PAIR], handled: ["tv:7:S1E2"] },
    ]);
  });

  it("without a season product, the targets are the episode and the series", async () => {
    const w = world();
    expect(
      await handleFinish(episode(2, 1), w.ports, DEFAULT_THRESHOLDS),
    ).toEqual({
      kind: "done",
      ratingTargets: [
        { label: "épisode", productId: 6001 },
        { label: "série", productId: SERIES_SC },
      ],
    });
    expect(w.calls).toContain("seasonInfo:1007:2");
  });

  it("finds the episode by its number, not by its position", async () => {
    const seasons = {
      [`${SERIES_SC}:1`]: {
        seasonProductId: SEASON1_SC,
        episodes: [ep(1, 3, 5003), ep(1, 1, 5001), ep(1, 2, 5002)],
      },
    };
    const w = world({ seasons });
    await handleFinish(episode(1, 2), w.ports, DEFAULT_THRESHOLDS);
    expect(writesOf(w.calls)).toEqual(["markDone:5002:2026-11-03"]);
  });

  it("an unknown episode is not found: no read of its state, no write, nothing saved", async () => {
    const w = world();
    expect(
      await handleFinish(episode(1, 9), w.ports, DEFAULT_THRESHOLDS),
    ).toEqual({
      kind: "not-found",
    });
    expect(w.calls).toEqual(["load", "searchSc:La Série", "seasonInfo:1007:1"]);
    expect(w.saved).toEqual([]);
  });

  it("an episode already done is not rewritten and prompts nothing", async () => {
    const w = world({ flags: { 5002: { isDone: true, isWished: true } } });
    expect(
      await handleFinish(episode(1, 2), w.ports, DEFAULT_THRESHOLDS),
    ).toEqual({
      kind: "done",
      ratingTargets: [],
    });
    expect(writesOf(w.calls)).toEqual([]);
    expect(w.calls).not.toContain("today");
    expect(w.state.handled).toEqual(["tv:7:S1E2"]);
  });

  it("five episodes of one series: zero unwish and the series pair is never settled", async () => {
    const w = world({
      state: { mapping: [SERIES_PAIR], snapshot: [SERIES_PAIR] },
    });
    for (const number of [1, 2, 3, 4, 5]) {
      expect(
        (await handleFinish(episode(1, number), w.ports, DEFAULT_THRESHOLDS))
          .kind,
      ).toBe("done");
    }
    expect(w.calls.filter((c) => c.startsWith("unwish"))).toEqual([]);
    expect(writesOf(w.calls)).toEqual(
      [5001, 5002, 5003, 5004, 5005].map((id) => `markDone:${id}:${TODAY}`),
    );
    expect(w.state).toStrictEqual({
      ...emptyState(),
      mapping: [SERIES_PAIR],
      snapshot: [SERIES_PAIR],
      settled: [],
      handled: [
        "tv:7:S1E1",
        "tv:7:S1E2",
        "tv:7:S1E3",
        "tv:7:S1E4",
        "tv:7:S1E5",
      ],
    });
  });

  it.each([
    ["seasonInfo", { fail: ["seasonInfo"] as Port[] }, []],
    ["productState", { fail: ["productState"] as Port[] }, []],
    [
      "markDone",
      { fail: ["markDone"] as Port[] },
      ["markDone:5002:2026-11-03"],
    ],
  ])("a rejected %s rejects with nothing saved", async (name, opts, writes) => {
    const w = world(opts);
    expect(
      (await failure(handleFinish(episode(1, 2), w.ports, DEFAULT_THRESHOLDS)))
        .message,
    ).toBe(`${name} failed`);
    expect(writesOf(w.calls)).toEqual(writes);
    expect(w.calls).not.toContain("save");
    expect(w.saved).toEqual([]);
  });

  it("a rejected save rejects after the write", async () => {
    const w = world({ failSave: [1] });
    await failure(handleFinish(episode(1, 2), w.ports, DEFAULT_THRESHOLDS));
    expect(w.calls.slice(-2)).toEqual(["markDone:5002:2026-11-03", "save"]);
    expect(w.saved).toEqual([]);
  });
});

describe("episode threshold", () => {
  it("an episode at 0.8 under the default thresholds is marked done", async () => {
    const w = world();
    const outcome = await handleFinish(
      episode(1, 2, { progress: 0.8 }),
      w.ports,
      DEFAULT_THRESHOLDS,
    );
    expect(outcome.kind).toBe("done");
    expect(writesOf(w.calls)).toEqual(["markDone:5002:2026-11-03"]);
  });

  it("an episode at 0.79 is ignored after the load only", async () => {
    const w = world();
    const outcome = await handleFinish(
      episode(1, 2, { progress: 0.79 }),
      w.ports,
      DEFAULT_THRESHOLDS,
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "below-threshold" });
    expect(w.calls).toEqual(["load"]);
  });
});
