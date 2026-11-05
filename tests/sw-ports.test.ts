import { describe, expect, it } from "vitest";
import type { FinishedMessage } from "../src/content/playback-tracker";
import { emptyState } from "../src/core/state";
import { JobRejected } from "../src/ext/job-error";
import { NakaUnavailableError } from "../src/naka/naka-errors";
import {
  ScTimeoutError,
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-errors";
import { opensBreaker, withBreaker } from "../src/sw/circuit-breaker";
import { buildFinishPorts, finishEventOf } from "../src/sw/finish-ports";
import { buildSyncPorts } from "../src/sw/sync-ports";
import {
  countingLimiter,
  failure,
  fakeNaka,
  fakeSc,
  filmItem,
  memoryStore,
  nakaItem,
  seriesItem,
} from "./sw-fakes";

function limiters(calls: string[]) {
  return {
    naka: countingLimiter(calls, "naka"),
    sc: countingLimiter(calls, "sc"),
  };
}

function syncWorld(
  mode: "simulation" | "live",
  sc = fakeSc(),
  naka = fakeNaka(),
) {
  const slots: string[] = [];
  const { store, area } = memoryStore();
  const session = buildSyncPorts({
    naka: naka.client,
    sc: sc.client,
    limiters: limiters(slots),
    store,
    mode,
  });
  return { ...session, sc, naka, slots, area };
}

describe("sync ports: reads", () => {
  it("nakaIds is the proxy's playlist", async () => {
    const naka = fakeNaka({ playlistIds: async () => [3, 1] });
    const { ports } = syncWorld("live", fakeSc(), naka);
    expect(await ports.nakaIds()).toEqual([3, 1]);
    expect(naka.calls).toEqual(["playlistIds"]);
  });

  it("scWishlistIds is the union of the film and the series wishlists", async () => {
    const sc = fakeSc({
      readWishlist: async (universe) =>
        universe === "movie"
          ? [filmItem(1001), filmItem(1002)]
          : [seriesItem(1011)],
    });
    const { ports } = syncWorld("live", sc);
    expect(await ports.scWishlistIds()).toEqual([1001, 1002, 1011]);
    expect(sc.calls).toEqual(["readWishlist:movie", "readWishlist:tvShow"]);
  });

  it("scWishlistIds lists a product once, even if both reads hold it", async () => {
    const sc = fakeSc({
      readWishlist: async (universe) =>
        universe === "movie" ? [filmItem(1001)] : [filmItem(1001)],
    });
    const { ports } = syncWorld("live", sc);
    expect(await ports.scWishlistIds()).toEqual([1001]);
  });

  it("scWishlistIds rejects when either read rejects, and describes nothing from it", async () => {
    for (const bad of ["movie", "tvShow"]) {
      const sc = fakeSc({
        readWishlist: async (universe) => {
          if (universe === bad) throw new ScUnavailableError("down");
          return universe === "movie" ? [filmItem(1001)] : [seriesItem(1011)];
        },
      });
      const { ports } = syncWorld("live", sc);
      expect((await failure(ports.scWishlistIds())).message).toBe("down");
      expect(await ports.describeSc(1001)).toBeUndefined();
      expect(await ports.describeSc(1011)).toBeUndefined();
    }
  });

  it("describeSc reads the items of the run's wishlist read, and nothing else", async () => {
    const sc = fakeSc({
      readWishlist: async (universe) =>
        universe === "movie" ? [filmItem(1001, 1999)] : [seriesItem(1011)],
    });
    const { ports } = syncWorld("live", sc);
    expect(await ports.describeSc(1001)).toBeUndefined();
    await ports.scWishlistIds();
    expect(await ports.describeSc(1001)).toEqual({
      title: "Film 1001",
      type: "film",
      year: 1999,
    });
    expect(await ports.describeSc(1011)).toEqual({
      title: "Serie 1011",
      type: "serie",
    });
    expect(await ports.describeSc(1005)).toBeUndefined();
    expect(sc.calls).toEqual(["readWishlist:movie", "readWishlist:tvShow"]);
  });

  it("describeNaka reads contentById through the Naka limiter, once per id", async () => {
    const naka = fakeNaka({
      contentById: async (id) => (id === 7 ? nakaItem(7) : undefined),
    });
    const { ports, slots } = syncWorld("live", fakeSc(), naka);
    const titled = {
      title: "Titre 7",
      type: "film",
      originalTitle: "Original 7",
      year: 2004,
    };
    expect(await ports.describeNaka(7)).toEqual(titled);
    expect(await ports.describeNaka(7)).toEqual(titled);
    expect(await ports.describeNaka(8)).toBeUndefined();
    expect(naka.calls).toEqual(["contentById:7", "contentById:8"]);
    expect(slots).toEqual(["limit:naka", "limit:naka"]);
  });

  it("describeNaka does not remember a failure", async () => {
    let fail = true;
    const naka = fakeNaka({
      contentById: async (id) => {
        if (fail) throw new NakaUnavailableError("Naka tab: unavailable");
        return nakaItem(id);
      },
    });
    const { ports } = syncWorld("live", fakeSc(), naka);
    await failure(ports.describeNaka(7));
    fail = false;
    expect((await ports.describeNaka(7))?.title).toBe("Titre 7");
  });

  it("searchNaka goes through the Naka limiter and gives candidates", async () => {
    const naka = fakeNaka({ search: async () => [nakaItem(4, "tv")] });
    const { ports, slots } = syncWorld("live", fakeSc(), naka);
    expect(await ports.searchNaka("Titre 4")).toEqual([
      {
        id: 4,
        title: "Titre 4",
        type: "serie",
        originalTitle: "Original 4",
        year: 2004,
      },
    ]);
    expect(slots).toEqual(["limit:naka"]);
  });

  it("searchSc searches both universes, one SensCritique slot each, and drops non-titles", async () => {
    const episode = { ...seriesItem(5001), universe: 32 };
    const sc = fakeSc({
      search: async (_q, universe) =>
        universe === "movie" ? [filmItem(1001)] : [seriesItem(1011), episode],
    });
    const { ports, slots } = syncWorld("live", sc);
    const found = await ports.searchSc("Dune");
    expect(found.map((c) => c.id)).toEqual([1001, 1011]);
    expect(sc.calls).toEqual(["search:movie:Dune", "search:tvShow:Dune"]);
    expect(slots).toEqual(["limit:sc", "limit:sc"]);
  });

  it("load and save are the store's", async () => {
    const { ports, area } = syncWorld("live");
    expect(await ports.load()).toEqual(emptyState());
    await ports.save({ ...emptyState(), run: 3 });
    expect(area.data.get("state")).toMatchObject({ run: 3 });
    expect((await ports.load()).run).toBe(3);
  });
});

describe("sync ports: writes in live mode", () => {
  it("addToNaka adds to the playlist", async () => {
    const { ports, naka, planned } = syncWorld("live");
    await ports.addToNaka(5);
    expect(naka.calls).toEqual(["addToPlaylist:5"]);
    expect(planned).toEqual([]);
  });

  it("addToSc reads the product state, then wishes a product not done", async () => {
    const { ports, sc } = syncWorld("live");
    expect(await ports.addToSc(1005)).toBe("added");
    expect(sc.calls).toEqual(["productState:1005", "wish:1005"]);
  });

  it("addToSc never wishes a product already done", async () => {
    const sc = fakeSc({
      productState: async () => ({
        isDone: true,
        isWished: false,
        universe: 1,
        rating: null,
      }),
    });
    const { ports } = syncWorld("live", sc);
    expect(await ports.addToSc(1005)).toBe("already-done");
    expect(sc.calls).toEqual(["productState:1005"]);
  });
});

describe("sync ports: writes in simulation", () => {
  it("addToNaka records the planned write and writes nothing", async () => {
    const { ports, naka, planned } = syncWorld("simulation");
    await ports.addToNaka(5);
    expect(naka.calls).toEqual([]);
    expect(planned).toEqual([{ side: "naka", id: 5 }]);
  });

  it("addToSc reads the product state, records the write, and wishes nothing", async () => {
    const { ports, sc, planned } = syncWorld("simulation");
    expect(await ports.addToSc(1005)).toBe("added");
    expect(sc.calls).toEqual(["productState:1005"]);
    expect(planned).toEqual([{ side: "sc", id: 1005 }]);
  });

  it("addToSc reports already-done from the real read and plans nothing", async () => {
    const sc = fakeSc({
      productState: async () => ({
        isDone: true,
        isWished: false,
        universe: 1,
        rating: null,
      }),
    });
    const { ports, planned } = syncWorld("simulation", sc);
    expect(await ports.addToSc(1005)).toBe("already-done");
    expect(planned).toEqual([]);
  });

  it("an unknown mode writes nothing", async () => {
    const mode = "Live" as "live";
    const { ports, sc, naka } = syncWorld(mode);
    await ports.addToNaka(5);
    await ports.addToSc(1005);
    expect(naka.calls).toEqual([]);
    expect(sc.calls).toEqual(["productState:1005"]);
  });
});

describe("circuit breaker: what opens it", () => {
  const opening: [string, Error][] = [
    ["a Naka session error", new JobRejected("naka-session")],
    ["a Naka 429", new NakaUnavailableError("Naka tab: HTTP 429", 429)],
    ["a SensCritique session error", new ScUnauthenticatedError()],
    [
      "a SensCritique 429",
      new ScUnavailableError("SensCritique SearchProductExplorer: HTTP 429"),
    ],
    ["a SensCritique timeout (K4)", new ScTimeoutError("UserCollection")],
  ];
  const closed: [string, unknown][] = [
    ["no Naka tab", new JobRejected("no-naka-tab")],
    ["another account", new JobRejected("other-account")],
    ["a Naka 404", new NakaUnavailableError("Naka tab: HTTP 404", 404)],
    ["a Naka outage", new NakaUnavailableError("Naka tab: unavailable")],
    [
      "a SensCritique 500",
      new ScUnavailableError("SensCritique UserCollection: HTTP 500"),
    ],
    [
      "a SensCritique request that failed before its timeout",
      new ScUnavailableError("SensCritique UserCollection: request failed"),
    ],
    ["a plain error", new Error("HTTP 429")],
    ["a RangeError", new RangeError("id must be a positive safe integer")],
    ["a string", "HTTP 429"],
  ];

  it.each(opening)("opens on %s", (_name, error) => {
    expect(opensBreaker(error)).toBe(true);
  });

  it.each(closed)("stays closed on %s", (_name, error) => {
    expect(opensBreaker(error)).toBe(false);
  });
});

describe("circuit breaker: a port", () => {
  it("rejects at once after an opening error, with that error", async () => {
    const calls: number[] = [];
    const opener = new ScUnauthenticatedError();
    const port = withBreaker(async (n: number) => {
      calls.push(n);
      throw opener;
    });
    expect(await failure(port(1))).toBe(opener);
    expect(await failure(port(2))).toBe(opener);
    expect(calls).toEqual([1]);
  });

  it("keeps calling after an error that does not open it", async () => {
    const calls: number[] = [];
    const port = withBreaker(async (n: number) => {
      calls.push(n);
      if (n === 1) throw new ScUnavailableError("SensCritique x: HTTP 500");
      return n * 10;
    });
    await failure(port(1));
    expect(await port(2)).toBe(20);
    expect(calls).toEqual([1, 2]);
  });

  it("opens per port: one open port leaves the others closed", async () => {
    const sc = fakeSc({
      search: async () => {
        throw new ScUnauthenticatedError();
      },
    });
    const { ports } = syncWorld("live", sc);
    await failure(ports.searchSc("Dune"));
    await failure(ports.searchSc("Dune"));
    expect(await ports.addToSc(1005)).toBe("added");
    expect(sc.calls).toEqual([
      "search:movie:Dune",
      "productState:1005",
      "wish:1005",
    ]);
  });

  it("each sync port is guarded", async () => {
    const rateLimited = new NakaUnavailableError("Naka tab: HTTP 429", 429);
    const sessionGone = new JobRejected("naka-session");
    const scLimited = new ScUnavailableError("SensCritique x: HTTP 429");
    const naka = fakeNaka({
      playlistIds: async () => {
        throw sessionGone;
      },
      search: async () => {
        throw rateLimited;
      },
      contentById: async () => {
        throw rateLimited;
      },
      addToPlaylist: async () => {
        throw sessionGone;
      },
    });
    const sc = fakeSc({
      readWishlist: async () => {
        throw scLimited;
      },
      search: async () => {
        throw scLimited;
      },
      productState: async () => {
        throw new ScUnauthenticatedError();
      },
    });
    const { ports } = syncWorld("live", sc, naka);
    const twice = async (call: () => Promise<unknown>) => {
      await failure(call());
      await failure(call());
    };
    await twice(() => ports.nakaIds());
    await twice(() => ports.scWishlistIds());
    await twice(() => ports.describeNaka(7));
    await twice(() => ports.searchNaka("Dune"));
    await twice(() => ports.searchSc("Dune"));
    await twice(() => ports.addToNaka(5));
    await twice(() => ports.addToSc(1005));
    expect(naka.calls).toEqual([
      "playlistIds",
      "contentById:7",
      "search:Dune",
      "addToPlaylist:5",
    ]);
    expect(sc.calls).toEqual([
      "readWishlist:movie",
      "search:movie:Dune",
      "productState:1005",
    ]);
  });

  it("a new job's ports start closed", async () => {
    const sc = fakeSc({
      search: async () => {
        throw new ScUnauthenticatedError();
      },
    });
    const first = syncWorld("live", sc);
    await failure(first.ports.searchSc("Dune"));
    const second = syncWorld("live", sc);
    await failure(second.ports.searchSc("Dune"));
    expect(sc.calls).toEqual(["search:movie:Dune", "search:movie:Dune"]);
  });
});

function finishWorld(sc = fakeSc()) {
  const slots: string[] = [];
  const { store, area } = memoryStore();
  const ports = buildFinishPorts({
    sc: sc.client,
    limiters: limiters(slots),
    store,
    today: () => "2026-11-04",
  });
  return { ports, sc, slots, area };
}

describe("finish ports", () => {
  it("searchSc searches both universes through the SensCritique limiter", async () => {
    const sc = fakeSc({
      search: async (_q, universe) =>
        universe === "movie" ? [filmItem(1001)] : [seriesItem(1011)],
    });
    const { ports, slots } = finishWorld(sc);
    expect((await ports.searchSc("Dune")).map((c) => c.id)).toEqual([
      1001, 1011,
    ]);
    expect(slots).toEqual(["limit:sc", "limit:sc"]);
  });

  it("the writes and reads are the client's, and today is the injected one", async () => {
    const sc = fakeSc({
      productState: async () => ({
        isDone: false,
        isWished: true,
        universe: 1,
        rating: null,
      }),
      seasonInfo: async () => ({ seasonProductId: 4001, episodes: [] }),
    });
    const { ports } = finishWorld(sc);
    expect(await ports.productState(1001)).toEqual({
      isDone: false,
      isWished: true,
      universe: 1,
      rating: null,
    });
    await ports.unwish(1001);
    await ports.markDone(1001, "2026-11-04");
    expect(await ports.seasonInfo(1011, 2)).toEqual({
      seasonProductId: 4001,
      episodes: [],
    });
    expect(ports.today()).toBe("2026-11-04");
    expect(sc.calls).toEqual([
      "productState:1001",
      "unwish:1001",
      "markDone:1001:2026-11-04",
      "seasonInfo:1011:2",
    ]);
  });

  it("each finish port is guarded", async () => {
    const opener = new ScUnauthenticatedError();
    const throwing = async () => {
      throw opener;
    };
    const sc = fakeSc({
      search: throwing,
      productState: throwing,
      unwish: throwing,
      markDone: throwing,
      seasonInfo: throwing,
    });
    const { ports } = finishWorld(sc);
    const twice = async (call: () => Promise<unknown>) => {
      expect(await failure(call())).toBe(opener);
      expect(await failure(call())).toBe(opener);
    };
    await twice(() => ports.searchSc("Dune"));
    await twice(() => ports.productState(1001));
    await twice(() => ports.unwish(1001));
    await twice(() => ports.markDone(1001, "2026-11-04"));
    await twice(() => ports.seasonInfo(1011, 1));
    expect(sc.calls).toEqual([
      "search:movie:Dune",
      "productState:1001",
      "unwish:1001",
      "markDone:1001:2026-11-04",
      "seasonInfo:1011:1",
    ]);
  });

  it("load and save are the store's", async () => {
    const { ports, area } = finishWorld();
    await ports.save({ ...emptyState(), handled: ["movie:4"] });
    expect(area.data.get("state")).toMatchObject({ handled: ["movie:4"] });
    expect((await ports.load()).handled).toEqual(["movie:4"]);
  });
});

const finished = (over: Partial<FinishedMessage> = {}): FinishedMessage => ({
  type: "finished",
  source: "threshold",
  progress: 0.9,
  contentId: 7,
  ...over,
});

describe("the finish event of a finished message", () => {
  const reading = (item: ReturnType<typeof nakaItem> | undefined) => {
    const asked: number[] = [];
    const read = async (id: number) => {
      asked.push(id);
      return item;
    };
    return { asked, read };
  };

  it("a film takes its title from contentById", async () => {
    const item = nakaItem(7, "movie");
    const { asked, read } = reading(item);
    const found = await finishEventOf(finished(), read);
    expect(found?.event).toEqual({
      source: "threshold",
      progress: 0.9,
      naka: { contentId: 7, mediaType: "movie" },
      titled: {
        title: "Titre 7",
        type: "film",
        originalTitle: "Original 7",
        year: 2004,
      },
    });
    expect(found?.item).toBe(item);
    expect(asked).toEqual([7]);
  });

  it("an episode keeps the message's season and episode and the series title", async () => {
    const item = { ...nakaItem(7, "tv"), numberOfSeasons: 3 };
    const { read } = reading(item);
    const found = await finishEventOf(
      finished({ source: "explicit", progress: 1, season: 2, episode: 3 }),
      read,
    );
    expect(found?.item).toBe(item);
    expect(found?.event).toEqual({
      source: "explicit",
      progress: 1,
      naka: { contentId: 7, mediaType: "tv", season: 2, episode: 3 },
      titled: {
        title: "Titre 7",
        type: "serie",
        originalTitle: "Original 7",
        year: 2004,
      },
    });
  });

  it("a content Naka does not know gives nothing", async () => {
    const { read } = reading(undefined);
    expect(await finishEventOf(finished(), read)).toBeUndefined();
  });

  it("a series without an episode (the series-level vu) gives nothing", async () => {
    const { read } = reading(nakaItem(7, "tv"));
    expect(await finishEventOf(finished(), read)).toBeUndefined();
  });

  it("a series with half an episode gives nothing", async () => {
    const { read } = reading(nakaItem(7, "tv"));
    expect(await finishEventOf(finished({ season: 1 }), read)).toBeUndefined();
    expect(await finishEventOf(finished({ episode: 1 }), read)).toBeUndefined();
  });

  it("a film with a season or an episode gives nothing", async () => {
    const { read } = reading(nakaItem(7, "movie"));
    for (const over of [
      { season: 1, episode: 2 },
      { season: 1 },
      { episode: 2 },
    ]) {
      expect(await finishEventOf(finished(over), read)).toBeUndefined();
    }
  });

  it("a read that fails rejects", async () => {
    const read = async () => {
      throw new NakaUnavailableError("Naka tab: unavailable");
    };
    await failure(finishEventOf(finished(), read));
  });
});
