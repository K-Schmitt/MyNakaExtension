// watchWrites: whether a step wrote anything yet, SensCritique writes and sync state saves counted.
import { describe, expect, it } from "vitest";
import { emptyState } from "../src/core/state";
import type { ScClient } from "../src/sc/sc-client";
import type { JobDeps } from "../src/sw/job-deps";
import { watchWrites } from "../src/sw/write-watch";
import { countingLimiter, fakeSc, memoryStore } from "./sw-fakes";

function depsWith(over: Partial<ScClient> = {}) {
  const sc = fakeSc(over);
  const { area, store } = memoryStore();
  const limited: string[] = [];
  const deps: JobDeps = {
    store,
    tabs: { query: async () => [], send: async () => undefined },
    sc: sc.client,
    scUsername: async () => "owner",
    limiters: {
      naka: countingLimiter(limited, "naka"),
      sc: countingLimiter(limited, "sc"),
    },
    now: () => 0,
    today: () => "2026-11-14",
  };
  return { deps, sc, area };
}

type Write = (sc: ScClient) => Promise<void>;
const WRITES: [string, Write, string][] = [
  ["wish", (sc) => sc.wish(3), "wish:3"],
  ["unwish", (sc) => sc.unwish(3), "unwish:3"],
  ["markDone", (sc) => sc.markDone(3, "2026-11-01"), "markDone:3:2026-11-01"],
  [
    "markDoneWithoutDate",
    (sc) => sc.markDoneWithoutDate(3),
    "markDoneWithoutDate:3",
  ],
  ["unmarkDone", (sc) => sc.unmarkDone(3), "unmarkDone:3"],
  ["rate", (sc) => sc.rate(3, 7), "rate:3:7"],
];

describe("watchWrites", () => {
  it("nothing written: false", () => {
    const { deps } = depsWith();
    expect(watchWrites(deps).wrote()).toBe(false);
  });

  it.each(WRITES)(
    "%s counts, and reaches the client with its arguments",
    async (_name, write, call) => {
      const { deps, sc } = depsWith();
      const watched = watchWrites(deps);
      await write(watched.deps.sc);
      expect(watched.wrote()).toBe(true);
      expect(sc.calls).toEqual([call]);
    },
  );

  it.each(WRITES)(
    "%s that throws still counts (it may have reached SensCritique)",
    async (name, write) => {
      const boom = async () => {
        throw new Error("lost");
      };
      const { deps } = depsWith({ [name]: boom });
      const watched = watchWrites(deps);
      await expect(write(watched.deps.sc)).rejects.toThrow("lost");
      expect(watched.wrote()).toBe(true);
    },
  );

  it("a write whose call throws at once still counts", () => {
    const { deps } = depsWith({
      rate: () => {
        throw new Error("at once");
      },
    });
    const watched = watchWrites(deps);
    expect(() => watched.deps.sc.rate(3, 7)).toThrow("at once");
    expect(watched.wrote()).toBe(true);
  });

  it("the reads do not count", async () => {
    const { deps, sc } = depsWith();
    const watched = watchWrites(deps);
    await watched.deps.sc.productState(3);
    await watched.deps.sc.readWishlist("movie");
    await watched.deps.sc.search("x", "movie");
    await watched.deps.sc.seasonInfo(3, 1);
    expect(watched.wrote()).toBe(false);
    expect(sc.calls).toHaveLength(4);
  });

  it("a save of the sync state counts and is stored", async () => {
    const { deps, area } = depsWith();
    const watched = watchWrites(deps);
    await watched.deps.store.saveState(emptyState());
    expect(watched.wrote()).toBe(true);
    expect(area.data.get("state")).toEqual(emptyState());
  });

  it("the settings, the cards and the reads of the store do not count", async () => {
    const { deps } = depsWith();
    const watched = watchWrites(deps);
    const { store } = watched.deps;
    await store.saveSettings(await store.loadSettings());
    await store.saveRatings([]);
    await store.loadState();
    expect(watched.wrote()).toBe(false);
  });

  it("the original deps are left unwatched", async () => {
    const { deps } = depsWith();
    const watched = watchWrites(deps);
    await deps.sc.rate(3, 7);
    await deps.store.saveState(emptyState());
    expect(watched.wrote()).toBe(false);
  });
});
