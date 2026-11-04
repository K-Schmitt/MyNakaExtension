import { describe, expect, it } from "vitest";
import type { FinishedMessage } from "../src/content/playback-tracker";
import { contentKey, contentKeyOf, parseEvent } from "../src/core/finish-event";
import { emptyState, type SyncState } from "../src/core/state";
import {
  FINISH_WINDOW_MS,
  MAX_FINISHES_PER_WINDOW,
} from "../src/ext/finish-window";
import { parseSettings, type Settings } from "../src/ext/settings";
import { parseState } from "../src/ext/state-schema";
import { createStore } from "../src/ext/store";
import type { NakaClient, NakaItem } from "../src/naka/naka-client";
import { NakaUnavailableError } from "../src/naka/naka-errors";
import type { ScClient } from "../src/sc/sc-client";
import {
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-errors";
import type { ScWishItem } from "../src/sc/wishlist-page";
import { readScUsername } from "../src/sw/binding";
import { createJobQueue } from "../src/sw/job-queue";
import { createJobs } from "../src/sw/jobs";
import type { TabsPort } from "../src/sw/naka-proxy";
import { AUTO_RUN_GAP_MS } from "../src/sw/run-throttle";
import { strings, tabRunning } from "./naka-bridge-fakes";
import {
  countingLimiter,
  fakeNaka,
  fakeSc,
  memoryArea,
  memoryStore,
} from "./sw-fakes";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const BOUND = { scUsername: "owner", nakaAccount: "77" };

// Two films: 1 is on Naka only (SensCritique 1001), 2 on SensCritique only (Naka 2). One series 7 (1007).
const naka = (id: number, mediaType: "movie" | "tv" = "movie"): NakaItem => ({
  contentId: id,
  tmdbId: 9000 + id,
  mediaType,
  title: mediaType === "tv" ? `Serie ${id}` : `Film ${id}`,
  releaseDate: `${2000 + id}-01-01`,
});
const sc = (id: number, universe = 1): ScWishItem => ({
  productId: id,
  title: universe === 4 ? `Serie ${id - 1000}` : `Film ${id - 1000}`,
  url: universe === 4 ? `/serie/x/${id}` : `/film/x/${id}`,
  universe,
  year: 2000 + (id - 1000),
});
const CATALOGUE = new Map([1, 2, 3].map((id) => [id, naka(id)]));
CATALOGUE.set(7, naka(7, "tv"));

function catalogueNaka(over: Partial<NakaClient> = {}): Partial<NakaClient> {
  return {
    playlistIds: async () => [1],
    contentById: async (id) => CATALOGUE.get(id),
    search: async (q) => [...CATALOGUE.values()].filter((i) => i.title === q),
    ...over,
  };
}

function catalogueSc(over: Partial<ScClient> = {}): Partial<ScClient> {
  const products = [sc(1001), sc(1002), sc(1003), sc(1007, 4)];
  return {
    readWishlist: async (universe) => (universe === "movie" ? [sc(1002)] : []),
    search: async (q, universe) =>
      products.filter(
        (p) => p.title === q && p.universe === (universe === "movie" ? 1 : 4),
      ),
    productState: async (id) => ({
      isDone: false,
      isWished: id === 1002,
      universe: id >= 5000 ? 32 : id === 1007 ? 4 : 1,
    }),
    seasonInfo: async (id, season) => ({
      seasonProductId: 4000 + id,
      episodes: [1, 2].map((e) => ({
        productId: 5000 + e,
        season,
        episode: e,
        title: `Episode ${e}`,
      })),
    }),
    ...over,
  };
}

type Opts = {
  naka?: Partial<NakaClient>;
  sc?: Partial<ScClient>;
  account?: () => string | undefined;
  scUsername?: () => Promise<string>;
  tabs?: TabsPort;
  settings?: Settings;
  state?: SyncState;
  now?: () => number;
};

function world(o: Opts = {}) {
  const { area, store } = memoryStore();
  if (o.settings) area.data.set("settings", o.settings);
  if (o.state) area.data.set("state", o.state);
  const nk = fakeNaka(o.naka ?? catalogueNaka());
  const sk = fakeSc(o.sc ?? catalogueSc());
  const traffic = { sent: [] as unknown[], returned: [] as unknown[] };
  const tabs =
    o.tabs ?? tabRunning(nk.client, o.account ?? (() => "77"), traffic).tabs;
  const slots: string[] = [];
  const jobs = createJobs({
    store,
    tabs,
    sc: sk.client,
    scUsername: o.scUsername ?? (async () => "owner"),
    limiters: {
      naka: countingLimiter(slots, "naka"),
      sc: countingLimiter(slots, "sc"),
    },
    now: o.now ?? (() => NOW),
    today: () => "2026-11-04",
    timer: { set: () => 0, clear: () => undefined },
  });
  return {
    jobs,
    area,
    nk,
    sk,
    traffic,
    settings: () => parseSettings(area.data.get("settings")),
    state: () => parseState(area.data.get("state")),
  };
}

const writesOf = (calls: string[]) =>
  calls.filter((c) =>
    /^(wish|unwish|markDone|unmarkDone|rate|addToPlaylist|removeFromPlaylist):/.test(
      c,
    ),
  );

describe("sync job: simulation, then live", () => {
  it("simulation writes nothing, while its report and preview list the planned pairs", async () => {
    const w = world();
    await w.jobs.syncJob("button");
    expect(writesOf([...w.sk.calls, ...w.nk.calls])).toEqual([]);
    const run = w.settings().lastRun;
    expect(run).toMatchObject({
      at: NOW,
      trigger: "button",
      mode: "simulation",
      outcome: "ok",
    });
    expect(run?.report?.added).toEqual([
      { nakaId: 1, scId: 1001 },
      { nakaId: 2, scId: 1002 },
    ]);
    expect(run?.preview).toEqual([
      { side: "sc", title: "Film 1" },
      { side: "naka", title: "Film 2" },
    ]);
  });

  it("run 2 in live mode writes the planned pairs, and records no preview", async () => {
    const w = world();
    await w.jobs.syncJob("button");
    await w.jobs.setMode("live");
    await w.jobs.syncJob("button");
    expect(writesOf([...w.sk.calls, ...w.nk.calls])).toEqual([
      "wish:1001",
      "addToPlaylist:2",
    ]);
    const run = w.settings().lastRun;
    expect(run?.mode).toBe("live");
    expect(run?.report?.added).toEqual([
      { nakaId: 1, scId: 1001 },
      { nakaId: 2, scId: 1002 },
    ]);
    expect(run).not.toHaveProperty("preview");
  });

  it("a simulated product already done is reported, settled, and never previewed", async () => {
    const w = world({
      sc: catalogueSc({
        productState: async (id) => ({
          isDone: id === 1001,
          isWished: false,
          universe: 1,
        }),
      }),
    });
    await w.jobs.syncJob("button");
    const run = w.settings().lastRun;
    expect(run?.report?.alreadyDone).toEqual([{ nakaId: 1, scId: 1001 }]);
    expect(run?.preview).toEqual([{ side: "naka", title: "Film 2" }]);
    expect(w.state().settled).toEqual([{ nakaId: 1, scId: 1001 }]);
  });

  it("a preview title Naka cannot give is empty, and the preview keeps its count", async () => {
    let reads = 0;
    const w = world({
      state: {
        ...emptyState(),
        mapping: [{ nakaId: 1, scId: 1001 }],
      },
      naka: catalogueNaka({
        contentById: async (id) => {
          reads += 1;
          throw new NakaUnavailableError(`Naka content ${id}: unavailable`);
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(reads).toBe(1);
    expect(w.settings().lastRun?.preview).toEqual([
      { side: "sc", title: "" },
      { side: "naka", title: "Film 2" },
    ]);
  });
});

describe("the SensCritique username of the binding", () => {
  const TOKEN = "SCTOKENMARKER0123456789abcdefXY";
  const reader = (getSession: () => Promise<unknown>) =>
    readScUsername({
      fetch: async () => {
        throw new Error("no request expected");
      },
      getSession: getSession as () => Promise<{ token?: string }>,
    });

  it("is the session's username, never its token", async () => {
    const name = await reader(async () => ({
      token: TOKEN,
      username: "owner",
    }));
    expect(name).toBe("owner");
  });

  it.each([
    ["a logged-out page", {}],
    ["a token without a username", { token: TOKEN }],
    ["an empty username", { token: TOKEN, username: "" }],
  ])("%s rejects as unauthenticated", async (_name, session) => {
    const error = await reader(async () => session).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScUnauthenticatedError);
    expect(strings(error).join(" ")).not.toContain(TOKEN);
  });

  it("a reader failure carries none of its text", async () => {
    const error = await reader(async () => {
      throw new Error(`boom ${TOKEN}`);
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
    expect(strings(error).join(" ")).not.toContain(TOKEN);
  });
});

describe("sync job: preview titles", () => {
  it("a mapped title Naka no longer has gives an empty title", async () => {
    const w = world({
      state: { ...emptyState(), mapping: [{ nakaId: 1, scId: 1001 }] },
      naka: catalogueNaka({ contentById: async () => undefined }),
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.preview).toEqual([
      { side: "sc", title: "" },
      { side: "naka", title: "Film 2" },
    ]);
  });
});

describe("sync job: the binding", () => {
  it("is set at the first successful run", async () => {
    const w = world();
    await w.jobs.syncJob("button");
    expect(w.settings().binding).toEqual(BOUND);
  });

  it("is not set by a failed run", async () => {
    const w = world({
      naka: catalogueNaka({
        playlistIds: async () => {
          throw new NakaUnavailableError("Naka tab: unavailable");
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.outcome).toBe("failed");
    expect(w.settings()).not.toHaveProperty("binding");
  });

  it.each([
    [
      "another SensCritique account",
      { scUsername: "other", nakaAccount: "77" },
    ],
    ["another Naka account", { scUsername: "owner", nakaAccount: "88" }],
  ])("a mismatch (%s) stops the job before loadState", async (_name, bound) => {
    const w = world({ settings: { mode: "live", binding: bound } });
    await w.jobs.syncJob("button");
    expect(w.area.ops).not.toContain("get:state");
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([
      "set:settings",
    ]);
    expect(w.nk.calls).toEqual([]);
    expect(w.sk.calls).toEqual([]);
    expect(w.settings().lastRun).toEqual({
      at: NOW,
      trigger: "button",
      mode: "live",
      outcome: "failed",
      error: "other-account",
    });
    expect(w.settings().binding).toEqual(bound);
  });

  it("a binding without a Naka account takes the Naka account of the next successful run", async () => {
    const w = world({
      settings: { mode: "simulation", binding: { scUsername: "owner" } },
    });
    await w.jobs.syncJob("button");
    expect(w.settings().binding).toEqual(BOUND);
  });

  it("a matching binding lets the run go and stays as it is", async () => {
    const w = world({ settings: { mode: "simulation", binding: BOUND } });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.outcome).toBe("ok");
    expect(w.settings().binding).toEqual(BOUND);
  });
});

describe("sync job: failures", () => {
  it("no Naka tab gives no-naka-tab, with nothing saved but the run record", async () => {
    const tabs: TabsPort = {
      query: async () => [],
      send: async () => {
        throw new Error("no tab to send to");
      },
    };
    const w = world({ tabs });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.error).toBe("no-naka-tab");
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([
      "set:settings",
    ]);
    expect(w.area.ops).not.toContain("get:state");
  });

  it("an expired SensCritique session gives sc-session, with no write", async () => {
    const w = world({
      scUsername: async () => {
        throw new ScUnauthenticatedError();
      },
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.error).toBe("sc-session");
    expect(writesOf([...w.sk.calls, ...w.nk.calls])).toEqual([]);
    expect(w.area.ops).not.toContain("set:state");
  });

  it("a SensCritique token refused mid-run gives sc-session, with no write and no save", async () => {
    const w = world({
      sc: catalogueSc({
        readWishlist: async () => {
          throw new ScUnauthenticatedError();
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.error).toBe("sc-session");
    expect(writesOf([...w.sk.calls, ...w.nk.calls])).toEqual([]);
    expect(w.area.ops).not.toContain("set:state");
  });

  it("a Naka tab logged out gives naka-session", async () => {
    const w = world({ account: () => undefined });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.error).toBe("naka-session");
    expect(w.area.ops).not.toContain("get:state");
  });

  it("an expired Naka token gives naka-session", async () => {
    const w = world({
      naka: catalogueNaka({
        playlistIds: async () => {
          throw new NakaUnavailableError("no token");
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.error).toBe("naka-session");
  });

  it("an unreadable stored state gives stored-state and is left as it was", async () => {
    const w = world();
    w.area.data.set("state", { version: 2 });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.error).toBe("stored-state");
    expect(w.area.data.get("state")).toEqual({ version: 2 });
  });

  it("an outage gives unavailable", async () => {
    const w = world({
      sc: catalogueSc({
        readWishlist: async () => {
          throw new Error("network down");
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.error).toBe("unavailable");
  });

  it("unreadable settings: the job writes nothing at all", async () => {
    const w = world();
    w.area.data.set("settings", { mode: "everything" });
    await w.jobs.syncJob("button");
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([]);
    expect(w.area.data.get("settings")).toEqual({ mode: "everything" });
  });

  it("a store that fails to save the record leaves the job resolved", async () => {
    const w = world();
    w.area.set = async () => {
      throw new Error("quota");
    };
    await expect(w.jobs.syncJob("button")).resolves.toBeUndefined();
  });
});

describe("sync job: automatic triggers", () => {
  it.each(["naka-ready", "playlist"] as const)(
    "%s runs, and stores lastAutoRunAt",
    async (trigger) => {
      const w = world();
      await w.jobs.syncJob(trigger);
      expect(w.settings().lastRun?.trigger).toBe(trigger);
      expect(w.settings().lastAutoRunAt).toBe(NOW);
    },
  );

  it("an automatic run within the gap does nothing", async () => {
    const at = NOW - AUTO_RUN_GAP_MS + 1;
    const w = world({ settings: { mode: "live", lastAutoRunAt: at } });
    await w.jobs.syncJob("naka-ready");
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([]);
    expect(w.nk.calls).toEqual([]);
    expect(w.traffic.sent).toEqual([]);
  });

  it("an automatic run after the gap runs", async () => {
    const at = NOW - AUTO_RUN_GAP_MS;
    const w = world({ settings: { mode: "simulation", lastAutoRunAt: at } });
    await w.jobs.syncJob("playlist");
    expect(w.settings().lastRun?.outcome).toBe("ok");
    expect(w.settings().lastAutoRunAt).toBe(NOW);
  });

  it("a failed automatic run still counts for the gap", async () => {
    const w = world({ account: () => undefined });
    await w.jobs.syncJob("naka-ready");
    expect(w.settings().lastRun?.outcome).toBe("failed");
    expect(w.settings().lastAutoRunAt).toBe(NOW);
  });

  it("the button ignores the gap and does not move it", async () => {
    const at = NOW - 1;
    const w = world({ settings: { mode: "simulation", lastAutoRunAt: at } });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.outcome).toBe("ok");
    expect(w.settings().lastAutoRunAt).toBe(at);
  });
});

describe("sync job: one Naka tab per job", () => {
  it("every call of the job goes to the first tab, found once", async () => {
    const nk = fakeNaka(catalogueNaka());
    const real = tabRunning(nk.client, () => "77").tabs;
    const queried: string[] = [];
    const sentTo: number[] = [];
    const tabs: TabsPort = {
      query: async (url) => {
        queried.push(url);
        return [{ id: 11 }, { id: 12 }];
      },
      send: async (tabId, msg) => {
        sentTo.push(tabId);
        return real.send(tabId, msg);
      },
    };
    const w = world({ tabs });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.outcome).toBe("ok");
    expect(queried).toEqual(["https://naka.cx/*"]);
    expect(new Set(sentTo)).toEqual(new Set([11]));
    expect(sentTo.length).toBeGreaterThan(2);
  });

  it("each job finds its tab again", async () => {
    const nk = fakeNaka(catalogueNaka());
    const real = tabRunning(nk.client, () => "77").tabs;
    let queries = 0;
    const tabs: TabsPort = {
      query: async () => {
        queries += 1;
        return [{ id: 11 }];
      },
      send: (tabId, msg) => real.send(tabId, msg),
    };
    const w = world({ tabs });
    await w.jobs.syncJob("button");
    await w.jobs.syncJob("button");
    expect(queries).toBe(2);
  });
});

const finished = (over: Partial<FinishedMessage> = {}): FinishedMessage => ({
  type: "finished",
  source: "threshold",
  progress: 0.95,
  contentId: 3,
  ...over,
});

describe("finish job", () => {
  it("a film finish marks it seen, and records the finish", async () => {
    const w = world({ settings: { mode: "simulation" } });
    await w.jobs.finishJob(finished());
    expect(writesOf(w.sk.calls)).toEqual(["markDone:1003:2026-11-04"]);
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:3",
      outcome: "done",
    });
    expect(w.settings().finishWindow).toEqual({ from: NOW, count: 1 });
    expect(w.state().handled).toEqual(["movie:3"]);
  });

  it("the finish record keeps the rest of the settings", async () => {
    const before: Settings = {
      mode: "live",
      binding: BOUND,
      lastAutoRunAt: 7,
      lastRun: { at: 1, trigger: "button", mode: "live", outcome: "ok" },
    };
    const w = world({ settings: before });
    await w.jobs.finishJob(finished());
    expect(w.settings()).toEqual({
      ...before,
      finishWindow: { from: NOW, count: 1 },
      lastFinish: { at: NOW, key: "movie:3", outcome: "done" },
    });
  });

  it("an episode finish marks the episode seen", async () => {
    const w = world();
    await w.jobs.finishJob(finished({ contentId: 7, season: 1, episode: 2 }));
    expect(writesOf(w.sk.calls)).toEqual(["markDone:5002:2026-11-04"]);
    expect(w.settings().lastFinish?.key).toBe("tv:7:S1E2");
  });

  it("the title comes from contentById, never from the message", async () => {
    const forged = { ...finished(), title: "Film 1", year: 2001 };
    const w = world();
    await w.jobs.finishJob(forged);
    expect(w.sk.calls).toContain("search:movie:Film 3");
    expect(w.sk.calls.some((c) => c.includes("Film 1"))).toBe(false);
  });

  it("a forged finish for a content Naka does not know gives nothing but its count", async () => {
    const w = world({ settings: { mode: "live", binding: BOUND } });
    await w.jobs.finishJob(finished({ contentId: 999 }));
    expect(w.settings()).toEqual({
      mode: "live",
      binding: BOUND,
      finishWindow: { from: NOW, count: 1 },
    });
    expect(w.area.ops).not.toContain("get:state");
    expect(writesOf(w.sk.calls)).toEqual([]);
    expect(w.sk.calls.filter((c) => c.startsWith("search"))).toEqual([]);
  });

  it("a forged unknown id, with a live tab, leaves the last finish as it was", async () => {
    const lastFinish = { at: 5, key: "movie:1", outcome: "done" } as const;
    const w = world({ settings: { mode: "live", binding: BOUND, lastFinish } });
    await w.jobs.finishJob(finished({ contentId: 999 }));
    expect(w.nk.calls).toEqual(["contentById:999"]);
    expect(w.settings().lastFinish).toEqual(lastFinish);
  });

  it.each([
    ["a series without an episode", finished({ contentId: 7 })],
    ["a film with an episode", finished({ season: 1, episode: 1 })],
  ])("%s gives nothing but its count", async (_name, msg) => {
    const w = world();
    await w.jobs.finishJob(msg);
    expect(w.settings()).toEqual({
      mode: "simulation",
      finishWindow: { from: NOW, count: 1 },
    });
    expect(writesOf(w.sk.calls)).toEqual([]);
  });

  it("the content is read before the binding: an unknown one records nothing, even for another account", async () => {
    const w = world({
      settings: { mode: "live", binding: { scUsername: "other" } },
    });
    await w.jobs.finishJob(finished({ contentId: 999 }));
    expect(w.settings().lastFinish).toBeUndefined();
    expect(w.traffic.sent).toEqual([
      { type: "naka-call", call: "contentById", contentId: 999 },
    ]);
  });

  it("a failure while reading the content records failed, with its code", async () => {
    const tabs: TabsPort = {
      query: async () => [],
      send: async () => undefined,
    };
    const w = world({ tabs });
    await w.jobs.finishJob(finished());
    expect(w.settings()).toEqual({
      mode: "simulation",
      finishWindow: { from: NOW, count: 1 },
      lastFinish: {
        at: NOW,
        key: "movie:3",
        outcome: "failed",
        error: "no-naka-tab",
      },
    });
  });

  it("the stored threshold decides: 0.85 is ignored, 0.9 completes", async () => {
    const w = world({ state: { ...emptyState(), threshold: 0.9 } });
    await w.jobs.finishJob(finished({ progress: 0.85 }));
    expect(writesOf(w.sk.calls)).toEqual([]);
    expect(w.settings().lastFinish?.outcome).toBe("ignored");
    await w.jobs.finishJob(finished({ progress: 0.9 }));
    expect(writesOf(w.sk.calls)).toEqual(["markDone:1003:2026-11-04"]);
    expect(w.settings().lastFinish?.outcome).toBe("done");
  });

  it("a later ignored candidate of the same key keeps the recorded finish", async () => {
    const w = world();
    await w.jobs.finishJob(finished({ progress: 0.9 }));
    await w.jobs.finishJob(finished({ progress: 0.99 }));
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:3",
      outcome: "done",
    });
  });

  it("an ignored candidate of another key replaces the recorded finish", async () => {
    const w = world();
    await w.jobs.finishJob(finished({ progress: 0.9 }));
    await w.jobs.finishJob(finished({ contentId: 1, progress: 0.5 }));
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:1",
      outcome: "ignored",
    });
  });

  it("an ambiguous title asks the owner: the question stays in the state", async () => {
    const twin = { ...sc(2003), title: "Film 3", year: 2003 };
    const w = world({
      sc: catalogueSc({
        search: async (q, universe) =>
          universe === "movie" && q === "Film 3" ? [sc(1003), twin] : [],
      }),
    });
    await w.jobs.finishJob(finished());
    expect(writesOf(w.sk.calls)).toEqual([]);
    expect(w.settings().lastFinish?.outcome).toBe("needs-choice");
    expect(w.state().pending).toEqual([
      { kind: "ambiguity", side: "naka", id: 3, candidateIds: [1003, 2003] },
    ]);
  });

  it.each([
    [
      "a binding mismatch",
      { settings: { mode: "live", binding: { scUsername: "other" } } } as Opts,
      "other-account",
    ],
    [
      "an expired SensCritique session",
      {
        scUsername: async () => {
          throw new ScUnauthenticatedError();
        },
      } as Opts,
      "sc-session",
    ],
    [
      "a logged-out Naka tab",
      { account: () => undefined } as Opts,
      "naka-session",
    ],
  ])(
    "%s fails the finish after the content read, before any load or write",
    async (_name, opts, error) => {
      const w = world(opts);
      await w.jobs.finishJob(finished());
      expect(w.area.ops).not.toContain("get:state");
      expect(writesOf(w.sk.calls)).toEqual([]);
      expect(w.nk.calls).toEqual(["contentById:3"]);
      expect(w.settings().lastFinish).toEqual({
        at: NOW,
        key: "movie:3",
        outcome: "failed",
        error,
      });
    },
  );

  it("a finish failing in the handler is recorded as failed, with its code", async () => {
    const w = world({
      sc: catalogueSc({
        markDone: async () => {
          throw new ScUnauthenticatedError();
        },
      }),
    });
    await w.jobs.finishJob(finished());
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:3",
      outcome: "failed",
      error: "sc-session",
    });
  });

  it("the content read goes through the Naka limiter", async () => {
    const slots: string[] = [];
    const { store } = memoryStore();
    const nk = fakeNaka(catalogueNaka());
    const jobs = createJobs({
      store,
      tabs: tabRunning(nk.client, () => "77").tabs,
      sc: fakeSc(catalogueSc()).client,
      scUsername: async () => "owner",
      limiters: {
        naka: countingLimiter(slots, "naka"),
        sc: countingLimiter(slots, "sc"),
      },
      now: () => NOW,
      today: () => "2026-11-04",
      timer: { set: () => 0, clear: () => undefined },
    });
    await jobs.finishJob(finished({ contentId: 999 }));
    expect(slots).toEqual(["limit:naka"]);
  });
});

function jobsOn(area: ReturnType<typeof memoryArea>, tabs?: TabsPort) {
  const nk = fakeNaka(catalogueNaka());
  const sk = fakeSc(catalogueSc());
  const jobs = createJobs({
    store: createStore(area),
    tabs: tabs ?? tabRunning(nk.client, () => "77").tabs,
    sc: sk.client,
    scUsername: async () => "owner",
    limiters: { naka: countingLimiter([], "n"), sc: countingLimiter([], "s") },
    now: () => NOW,
    today: () => "2026-11-04",
    timer: { set: () => 0, clear: () => undefined },
  });
  return { jobs, nk, sk };
}

describe("finish job: at most 30 finishes an hour", () => {
  const full = (from: number) => ({ from, count: MAX_FINISHES_PER_WINDOW });

  it("over the limit: finish-limit, with no tab call, no SensCritique call and no state load", async () => {
    let tabCalls = 0;
    const nk = fakeNaka(catalogueNaka());
    const real = tabRunning(nk.client, () => "77").tabs;
    const tabs: TabsPort = {
      query: async (url) => {
        tabCalls += 1;
        return real.query(url);
      },
      send: async (tabId, msg) => {
        tabCalls += 1;
        return real.send(tabId, msg);
      },
    };
    const finishWindow = full(NOW - FINISH_WINDOW_MS + 1);
    const w = world({ tabs, settings: { mode: "live", finishWindow } });
    await w.jobs.finishJob(finished());
    expect(tabCalls).toBe(0);
    expect(w.sk.calls).toEqual([]);
    expect(w.area.ops).toEqual(["get:settings", "set:settings"]);
    expect(w.settings()).toEqual({
      mode: "live",
      finishWindow,
      lastFinish: {
        at: NOW,
        key: "movie:3",
        outcome: "failed",
        error: "finish-limit",
      },
    });
  });

  it("an hour after the window opened, the next finish runs in a new window", async () => {
    const w = world({
      settings: { mode: "live", finishWindow: full(NOW - FINISH_WINDOW_MS) },
    });
    await w.jobs.finishJob(finished());
    expect(writesOf(w.sk.calls)).toEqual(["markDone:1003:2026-11-04"]);
    expect(w.settings().finishWindow).toEqual({ from: NOW, count: 1 });
  });

  it("every finish that passes the check counts, whatever its outcome", async () => {
    const from = NOW - 1000;
    const w = world({
      settings: { mode: "live", finishWindow: { from, count: 27 } },
      state: { ...emptyState(), threshold: 0.9 },
    });
    await w.jobs.finishJob(finished({ contentId: 999 }));
    await w.jobs.finishJob(finished({ progress: 0.5 }));
    await w.jobs.finishJob(finished({ contentId: 7 }));
    expect(w.settings().finishWindow).toEqual({ from, count: 30 });
    await w.jobs.finishJob(finished());
    expect(writesOf(w.sk.calls)).toEqual([]);
    expect(w.settings().lastFinish?.error).toBe("finish-limit");
  });

  it("the window survives a worker restart", async () => {
    const area = memoryArea();
    area.data.set("settings", {
      mode: "live",
      finishWindow: { from: NOW - 10, count: 29 },
    });
    await jobsOn(area).jobs.finishJob(finished());
    const restarted = jobsOn(area);
    await restarted.jobs.finishJob(finished({ contentId: 1 }));
    expect(restarted.nk.calls).toEqual([]);
    expect(parseSettings(area.data.get("settings")).lastFinish).toEqual({
      at: NOW,
      key: "movie:1",
      outcome: "failed",
      error: "finish-limit",
    });
  });
});

describe("one content key", () => {
  it.each([
    [{ contentId: 3 }, "movie"],
    [{ contentId: 7, season: 1, episode: 2 }, "tv"],
  ] as const)(
    "the key of %o is the core's content key of its event",
    (ids, mediaType) => {
      const event = parseEvent({
        source: "explicit",
        progress: 1,
        naka: { ...ids, mediaType },
        titled: { title: "T", type: mediaType === "tv" ? "serie" : "film" },
      });
      expect(contentKeyOf(ids)).toBe(contentKey(event));
    },
  );
});

describe("jobs on one queue", () => {
  it("two finished messages for one key give one write set", async () => {
    const w = world();
    const queue = createJobQueue();
    await Promise.all([
      queue.run(() => w.jobs.finishJob(finished())),
      queue.run(() =>
        w.jobs.finishJob(finished({ source: "explicit", progress: 1 })),
      ),
    ]);
    expect(writesOf(w.sk.calls)).toEqual(["markDone:1003:2026-11-04"]);
    expect(w.state().handled).toEqual(["movie:3"]);
  });

  it("a finish queued during a sync loads the state the sync saved", async () => {
    const w = world();
    const queue = createJobQueue();
    const sync = queue.run(() => w.jobs.syncJob("button"));
    const finish = queue.run(() =>
      w.jobs.finishJob(finished({ contentId: 1 })),
    );
    await Promise.all([sync, finish]);
    const ops = w.area.ops;
    const syncSave = ops.indexOf("set:state");
    const finishLoad = ops.indexOf("get:state", syncSave);
    expect(syncSave).toBeGreaterThan(-1);
    expect(finishLoad).toBeGreaterThan(syncSave);
    // The finish found the pair the sync mapped: it searched nothing more for "Film 1".
    const searches = w.sk.calls.filter((c) => c === "search:movie:Film 1");
    expect(searches).toHaveLength(1);
    expect(w.settings().lastFinish?.outcome).toBe("done");
  });
});

// Review Focus 3: MV3 may kill the worker at any await. Every outside call of the job is counted, and
// the k-th one never returns, for every k a full job makes.
describe("a worker killed at any await", () => {
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const never = <T>() => new Promise<T>(() => undefined);

  function killedAt(k: number) {
    let calls = 0;
    const dies = () => {
      calls += 1;
      return calls === k;
    };
    const guard = <T extends object>(target: T): T =>
      new Proxy(target, {
        get(object, key) {
          const value = Reflect.get(object, key);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) =>
            dies() ? never() : Reflect.apply(value, object, args);
        },
      });
    const area = memoryArea();
    const nk = fakeNaka(catalogueNaka());
    const jobs = createJobs({
      store: createStore(guard(area)),
      tabs: guard(tabRunning(nk.client, () => "77").tabs),
      sc: guard(fakeSc(catalogueSc()).client),
      scUsername: () => (dies() ? never() : Promise.resolve("owner")),
      limiters: {
        naka: guard(countingLimiter([], "naka")),
        sc: guard(countingLimiter([], "sc")),
      },
      now: () => NOW,
      today: () => "2026-11-04",
      timer: { set: () => 0, clear: () => undefined },
    });
    return { jobs, area, calls: () => calls };
  }

  const savedStates = (area: ReturnType<typeof memoryArea>) =>
    area.sets.flatMap((set) =>
      "state" in set ? [JSON.stringify(set.state)] : [],
    );

  it("a sync leaves the state it found or the one it saved, and the next job starts from it", async () => {
    const full = killedAt(0);
    await full.jobs.syncJob("button");
    const total = full.calls();
    const states = savedStates(full.area);
    expect(states).toHaveLength(1);
    const [saved] = states;
    expect(total).toBeGreaterThan(15);
    for (let k = 1; k <= total; k++) {
      const w = killedAt(k);
      void w.jobs.syncJob("button");
      await settle();
      const state = w.area.data.get("state");
      expect([undefined, saved]).toContain(
        state === undefined ? undefined : JSON.stringify(state),
      );
      const next = createJobs({
        store: createStore(w.area),
        tabs: tabRunning(fakeNaka(catalogueNaka()).client, () => "77").tabs,
        sc: fakeSc(catalogueSc()).client,
        scUsername: async () => "owner",
        limiters: {
          naka: countingLimiter([], "n"),
          sc: countingLimiter([], "s"),
        },
        now: () => NOW,
        today: () => "2026-11-04",
        timer: { set: () => 0, clear: () => undefined },
      });
      await next.syncJob("button");
      expect(parseSettings(w.area.data.get("settings")).lastRun?.outcome).toBe(
        "ok",
      );
    }
  });

  it("a finish leaves the state it found, the settled pair, or the handled key", async () => {
    const full = killedAt(0);
    await full.jobs.finishJob(finished());
    const total = full.calls();
    const states = savedStates(full.area);
    expect(states).toHaveLength(2);
    expect(total).toBeGreaterThan(8);
    for (let k = 1; k <= total; k++) {
      const w = killedAt(k);
      void w.jobs.finishJob(finished());
      await settle();
      const state = w.area.data.get("state");
      expect([undefined, ...states]).toContain(
        state === undefined ? undefined : JSON.stringify(state),
      );
    }
  });
});

describe("set mode", () => {
  it("saves the mode and keeps the rest of the settings", async () => {
    const before: Settings = {
      mode: "simulation",
      binding: BOUND,
      lastAutoRunAt: 5,
    };
    const w = world({ settings: before });
    await w.jobs.setMode("live");
    expect(w.settings()).toEqual({ ...before, mode: "live" });
  });

  it("on unreadable settings writes nothing", async () => {
    const w = world();
    w.area.data.set("settings", { mode: 3 });
    await w.jobs.setMode("live");
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([]);
  });

  it("the mode already set writes nothing", async () => {
    const w = world({ settings: { mode: "live" } });
    await w.jobs.setMode("live");
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([]);
  });
});

describe("status snapshot", () => {
  it("holds the mode, the records, the binding and the counts", async () => {
    const state: SyncState = {
      ...emptyState(),
      pending: [
        {
          kind: "removal",
          removeFrom: "sc",
          pair: { nakaId: 1, scId: 1001 },
          asked: false,
        },
        {
          kind: "removal",
          removeFrom: "naka",
          pair: { nakaId: 2, scId: 1002 },
          asked: true,
        },
        { kind: "ambiguity", side: "naka", id: 3, candidateIds: [1003, 2003] },
      ],
      unlinked: [{ side: "sc", id: 1009, title: "Film 9", reason: "no-match" }],
    };
    const settings: Settings = {
      mode: "live",
      binding: BOUND,
      lastAutoRunAt: 4,
      lastRun: {
        at: 1,
        trigger: "button",
        mode: "live",
        outcome: "failed",
        error: "sc-session",
      },
      lastFinish: { at: 2, key: "movie:3", outcome: "done" },
    };
    const w = world({ settings, state });
    expect(await w.jobs.statusSnapshot()).toEqual({
      mode: "live",
      binding: BOUND,
      lastRun: settings.lastRun,
      lastFinish: settings.lastFinish,
      counts: { pendingRemovals: 2, openQuestions: 1, unlinked: 1 },
    });
  });

  it("on a first install: simulation and zero counts", async () => {
    const w = world();
    expect(await w.jobs.statusSnapshot()).toEqual({
      mode: "simulation",
      counts: { pendingRemovals: 0, openQuestions: 0, unlinked: 0 },
    });
  });

  it("unreadable settings give stored-state and nothing else", async () => {
    const w = world();
    w.area.data.set("settings", { mode: 3 });
    expect(await w.jobs.statusSnapshot()).toEqual({ error: "stored-state" });
  });

  it("an unreadable state gives the settings and stored-state", async () => {
    const w = world({ settings: { mode: "live" } });
    w.area.data.set("state", { version: 2 });
    expect(await w.jobs.statusSnapshot()).toEqual({
      mode: "live",
      error: "stored-state",
    });
  });

  it("a storage outage gives unavailable", async () => {
    const w = world();
    w.area.get = async () => {
      throw new Error("storage down");
    };
    expect(await w.jobs.statusSnapshot()).toEqual({ error: "unavailable" });
  });

  it("holds no raw text: only known fields", async () => {
    const w = world();
    await w.jobs.syncJob("button");
    const snapshot = await w.jobs.statusSnapshot();
    expect(Object.keys(snapshot).sort()).toEqual(
      ["binding", "counts", "lastRun", "mode"].sort(),
    );
    expect(strings(snapshot).join(" ")).not.toMatch(/Error|HTTP|stack/);
  });
});
