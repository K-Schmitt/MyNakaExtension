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

describe("sync job: a Naka tab lost mid-run (Ruling 17)", () => {
  // One Naka tab: with several, a dead one is passed over (see "one Naka tab per job").
  function closingTab(closeAfter: string | undefined) {
    const nk = fakeNaka(catalogueNaka());
    const real = tabRunning(nk.client, () => "77").tabs;
    let closed = closeAfter === undefined;
    const failed: unknown[] = [];
    const afterLoss: unknown[] = [];
    const tabs: TabsPort = {
      query: async (url) => {
        if (failed.length > 0) afterLoss.push("query");
        return (await real.query(url)).slice(0, 1);
      },
      send: async (tabId, msg) => {
        if (failed.length > 0) afterLoss.push(msg);
        if (closed) {
          failed.push(msg);
          throw new Error("Could not establish connection.");
        }
        const reply = await real.send(tabId, msg);
        if ("call" in msg && msg.call === closeAfter) closed = true;
        return reply;
      },
    };
    return { tabs, failed, afterLoss };
  }

  it("no Naka call reaches the tab after the loss; the run saves Plan 2's counts and says no-naka-tab", async () => {
    const t = closingTab("playlistIds");
    const w = world({ tabs: t.tabs });
    await w.jobs.syncJob("button");
    expect(t.failed).toEqual([
      { type: "naka-call", call: "contentById", contentId: 1 },
    ]);
    expect(t.afterLoss).toEqual([]);
    const run = w.settings().lastRun;
    expect(run).toMatchObject({ outcome: "ok", error: "no-naka-tab" });
    expect(run?.report?.unresolved).toBe(2);
    expect(() => w.state()).not.toThrow();
    expect(w.area.ops).toContain("set:state");
  });

  it("a content script gone at the start fails the job with no-naka-tab, saving nothing", async () => {
    const t = closingTab(undefined);
    const w = world({ tabs: t.tabs });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun).toMatchObject({
      outcome: "failed",
      error: "no-naka-tab",
    });
    expect(w.area.ops).not.toContain("get:state");
    expect(t.failed).toEqual([{ type: "naka-account" }]);
    expect(t.afterLoss).toEqual([]);
  });
});

describe("sync job: a run that a breaker stopped says so (Ruling 17)", () => {
  it("a SensCritique session that expires after the first write gives ok with sc-session", async () => {
    let reads = 0;
    const w = world({
      settings: { mode: "live" },
      state: {
        ...emptyState(),
        mapping: [
          { nakaId: 1, scId: 1001 },
          { nakaId: 3, scId: 1003 },
        ],
      },
      naka: catalogueNaka({ playlistIds: async () => [1, 3] }),
      sc: catalogueSc({
        readWishlist: async () => [],
        productState: async (id) => {
          reads += 1;
          if (reads > 1) throw new ScUnauthenticatedError();
          return {
            isDone: false,
            isWished: false,
            universe: id === 1007 ? 4 : 1,
          };
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(writesOf(w.sk.calls)).toEqual(["wish:1001"]);
    expect(w.settings().lastRun).toMatchObject({
      outcome: "ok",
      error: "sc-session",
    });
  });

  it("a Naka rate limit mid-run gives ok with unavailable", async () => {
    const w = world({
      naka: catalogueNaka({
        search: async () => {
          throw new NakaUnavailableError("Naka search: HTTP 429", 429);
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun).toMatchObject({
      outcome: "ok",
      error: "unavailable",
    });
  });

  it("the first stop is the one recorded", async () => {
    const nk = fakeNaka(catalogueNaka());
    const real = tabRunning(nk.client, () => "77").tabs;
    let closed = false;
    const tabs: TabsPort = {
      query: (url) => real.query(url),
      send: async (tabId, msg) => {
        if (closed) throw new Error("Could not establish connection.");
        const reply = await real.send(tabId, msg);
        if ("call" in msg && msg.call === "contentById") closed = true;
        return reply;
      },
    };
    const w = world({
      tabs,
      sc: catalogueSc({
        search: async () => {
          throw new ScUnavailableError(
            "SensCritique SearchProductExplorer: HTTP 429",
          );
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun).toMatchObject({
      outcome: "ok",
      error: "unavailable",
    });
  });

  it("a run nothing stopped has no error", async () => {
    const w = world();
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.outcome).toBe("ok");
    expect(w.settings().lastRun).not.toHaveProperty("error");
  });

  it("an error that opens no breaker is not recorded", async () => {
    const w = world({
      naka: catalogueNaka({
        search: async () => {
          throw new NakaUnavailableError("Naka search: HTTP 500", 500);
        },
      }),
    });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun?.outcome).toBe("ok");
    expect(w.settings().lastRun).not.toHaveProperty("error");
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

  // A tab opened before the install, or any tab after an extension reload, has no content script.
  function tabsWithDead(dead: number[], ids: number[]) {
    const nk = fakeNaka(catalogueNaka());
    const real = tabRunning(nk.client, () => "77").tabs;
    const sent: { tabId: number; msg: unknown }[] = [];
    let queries = 0;
    const tabs: TabsPort = {
      query: async () => {
        queries += 1;
        return ids.map((id) => ({ id }));
      },
      send: async (tabId, msg) => {
        sent.push({ tabId, msg });
        if (dead.includes(tabId)) {
          throw new Error("Receiving end does not exist.");
        }
        return real.send(tabId, msg);
      },
    };
    return { nk, tabs, sent, queries: () => queries };
  }

  it("a first tab without a listener is passed over: the job pins the second, for its binding check and its writes", async () => {
    const t = tabsWithDead([10], [10, 11, 12]);
    const w = world({ tabs: t.tabs, settings: { mode: "live" } });
    await w.jobs.syncJob("button");
    const run = w.settings().lastRun;
    expect(run).toMatchObject({ mode: "live", outcome: "ok" });
    expect(run).not.toHaveProperty("error");
    expect(t.sent.slice(0, 2)).toEqual([
      { tabId: 10, msg: { type: "naka-account" } },
      { tabId: 11, msg: { type: "naka-account" } },
    ]);
    expect(new Set(t.sent.slice(1).map((s) => s.tabId))).toEqual(new Set([11]));
    expect(t.sent).toContainEqual({
      tabId: 11,
      msg: { type: "naka-call", call: "add", contentId: 2 },
    });
    expect(t.nk.calls).toContain("addToPlaylist:2");
    expect(t.queries()).toBe(1);
  });

  it("every tab without a listener: no-naka-tab, each tried once, nothing saved but the run record", async () => {
    const t = tabsWithDead([10, 11], [10, 11]);
    const w = world({ tabs: t.tabs });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun).toMatchObject({
      outcome: "failed",
      error: "no-naka-tab",
    });
    expect(t.sent.map((s) => s.tabId)).toEqual([10, 11]);
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([
      "set:settings",
    ]);
    expect(w.area.ops).not.toContain("get:state");
  });

  it("the pinned tab dying mid-run latches the job: no other tab is tried", async () => {
    const nk = fakeNaka(catalogueNaka());
    const real = tabRunning(nk.client, () => "77").tabs;
    const sent: number[] = [];
    const afterLoss: number[] = [];
    let dies = false;
    let lostAt: number | undefined;
    const tabs: TabsPort = {
      query: async () => {
        if (lostAt !== undefined) afterLoss.push(0);
        return [{ id: 10 }, { id: 11 }, { id: 12 }];
      },
      send: async (tabId, msg) => {
        if (lostAt !== undefined) afterLoss.push(tabId);
        sent.push(tabId);
        if (tabId === 10) throw new Error("Receiving end does not exist.");
        if (tabId === 11 && dies) {
          lostAt = sent.length;
          throw new Error("Receiving end does not exist.");
        }
        const reply = await real.send(tabId, msg);
        if ("call" in msg && msg.call === "playlistIds") dies = true;
        return reply;
      },
    };
    const w = world({ tabs });
    await w.jobs.syncJob("button");
    expect(w.settings().lastRun).toMatchObject({
      outcome: "ok",
      error: "no-naka-tab",
    });
    expect(sent.slice(0, 2)).toEqual([10, 11]);
    expect(lostAt).toBeDefined();
    expect(afterLoss).toEqual([]);
    expect(sent).not.toContain(12);
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
    expect(w.area.ops).not.toContain("set:state");
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

  it("the stored threshold decides: 0.85 is free, 0.9 completes", async () => {
    const w = world({ state: { ...emptyState(), threshold: 0.9 } });
    await w.jobs.finishJob(finished({ progress: 0.85 }));
    expect(writesOf(w.sk.calls)).toEqual([]);
    expect(w.settings()).toEqual({ mode: "simulation" });
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

  it("a candidate of another key below the threshold leaves the recorded finish as it was", async () => {
    const w = world();
    await w.jobs.finishJob(finished({ progress: 0.9 }));
    await w.jobs.finishJob(finished({ contentId: 1, progress: 0.5 }));
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:3",
      outcome: "done",
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
    "%s fails the finish after the content read, before any write",
    async (_name, opts, error) => {
      const w = world(opts);
      await w.jobs.finishJob(finished());
      // Ruling 18: the local pre-check reads the state once; nothing reaches handleFinish.
      expect(w.area.ops.filter((op) => op === "get:state")).toHaveLength(1);
      expect(w.area.ops).not.toContain("set:state");
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

  it("over the limit: finish-limit, with no tab call, no SensCritique call and no state write", async () => {
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
    expect(w.area.ops).toEqual(["get:settings", "get:state", "set:settings"]);
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

  it("every finish that passes the checks counts, whatever its outcome; one decided locally is free", async () => {
    const from = NOW - 1000;
    const w = world({
      settings: { mode: "live", finishWindow: { from, count: 27 } },
      state: { ...emptyState(), threshold: 0.9 },
    });
    await w.jobs.finishJob(finished({ contentId: 999 }));
    await w.jobs.finishJob(finished({ progress: 0.5 }));
    await w.jobs.finishJob(finished({ contentId: 7 }));
    expect(w.settings().finishWindow).toEqual({ from, count: 29 });
    await w.jobs.finishJob(finished({ contentId: 1 }));
    await w.jobs.finishJob(
      finished({ contentId: 1, source: "explicit", progress: 1 }),
    );
    expect(w.settings().finishWindow).toEqual({ from, count: 30 });
    await w.jobs.finishJob(finished());
    expect(writesOf(w.sk.calls)).toEqual(["markDone:1001:2026-11-04"]);
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

describe("finish job: only finishes that need the network count (Ruling 18)", () => {
  const TEN = 10;

  function countingTabs() {
    const nk = fakeNaka(catalogueNaka());
    const real = tabRunning(nk.client, () => "77").tabs;
    const calls: string[] = [];
    const tabs: TabsPort = {
      query: async (url) => {
        calls.push("query");
        return real.query(url);
      },
      send: async (tabId, msg) => {
        calls.push("send");
        return real.send(tabId, msg);
      },
    };
    return { tabs, calls };
  }

  const withEpisodes = (count: number) =>
    catalogueSc({
      seasonInfo: async (id, season) => ({
        seasonProductId: 4000 + id,
        episodes: Array.from({ length: count }, (_, i) => ({
          productId: 5001 + i,
          season,
          episode: i + 1,
          title: `Episode ${i + 1}`,
        })),
      }),
    });

  // What one viewing sends: the four marks, then Naka's own "vu" at the end.
  const viewing = (over: Partial<FinishedMessage> = {}) => [
    ...[0.85, 0.9, 0.95, 0.99].map((progress) =>
      finished({ ...over, progress }),
    ),
    finished({ ...over, source: "explicit", progress: 1 }),
  ];

  it("one viewing, four marks and its vu, costs one count and makes one write set", async () => {
    const w = world({ state: { ...emptyState(), threshold: 0.9 } });
    for (const msg of viewing()) await w.jobs.finishJob(msg);
    expect(w.settings().finishWindow).toEqual({ from: NOW, count: 1 });
    expect(writesOf(w.sk.calls)).toEqual(["markDone:1003:2026-11-04"]);
  });

  it("ten short episodes in one hour, five messages each, all complete", async () => {
    const w = world({
      sc: withEpisodes(TEN),
      state: { ...emptyState(), threshold: 0.9 },
    });
    for (let episode = 1; episode <= TEN; episode += 1) {
      for (const msg of viewing({ contentId: 7, season: 1, episode })) {
        await w.jobs.finishJob(msg);
      }
    }
    expect(writesOf(w.sk.calls)).toEqual(
      Array.from({ length: TEN }, (_, i) => `markDone:${5001 + i}:2026-11-04`),
    );
    expect(w.settings().finishWindow).toEqual({ from: NOW, count: TEN });
  });

  it.each([
    [
      "an already handled key",
      { ...emptyState(), handled: ["movie:3"] },
      finished({ source: "explicit", progress: 1 }),
    ],
    [
      "a progress below the threshold",
      { ...emptyState(), threshold: 0.9 },
      finished({ progress: 0.85 }),
    ],
  ])(
    "a flood of 1000 messages for %s costs nothing",
    async (_name, state, msg) => {
      const t = countingTabs();
      const lastFinish = { at: 5, key: "movie:1", outcome: "done" } as const;
      const w = world({
        tabs: t.tabs,
        state,
        settings: { mode: "live", lastFinish },
      });
      for (let i = 0; i < 1000; i += 1) await w.jobs.finishJob(msg);
      expect(t.calls).toEqual([]);
      expect(w.sk.calls).toEqual([]);
      expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([]);
      expect(w.settings()).toEqual({ mode: "live", lastFinish });
    },
  );

  it("an unreadable state stops the finish before any count: failed, stored-state", async () => {
    const t = countingTabs();
    const w = world({ tabs: t.tabs });
    w.area.data.set("state", { version: 2 });
    await w.jobs.finishJob(finished());
    expect(t.calls).toEqual([]);
    expect(w.settings()).toEqual({
      mode: "simulation",
      lastFinish: {
        at: NOW,
        key: "movie:3",
        outcome: "failed",
        error: "stored-state",
      },
    });
  });

  it("the slot is reserved before any network call", async () => {
    const t = countingTabs();
    const w = world({ tabs: t.tabs });
    let reservedFirst = false;
    const query = t.tabs.query;
    t.tabs.query = async (url) => {
      reservedFirst =
        parseSettings(w.area.data.get("settings")).finishWindow?.count === 1;
      return query(url);
    };
    await w.jobs.finishJob(finished());
    expect(reservedFirst).toBe(true);
    expect(w.settings().finishWindow).toEqual({ from: NOW, count: 1 });
  });

  it("a clock behind the window's start opens a new window (K2)", async () => {
    const w = world({
      settings: {
        mode: "live",
        finishWindow: {
          from: NOW + FINISH_WINDOW_MS,
          count: MAX_FINISHES_PER_WINDOW,
        },
      },
    });
    await w.jobs.finishJob(finished());
    expect(writesOf(w.sk.calls)).toEqual(["markDone:1003:2026-11-04"]);
    expect(w.settings().finishWindow).toEqual({ from: NOW, count: 1 });
  });

  it("over the limit, 100 refusals write the settings once (K3)", async () => {
    const w = world({
      settings: {
        mode: "live",
        finishWindow: { from: NOW - 10, count: MAX_FINISHES_PER_WINDOW },
      },
    });
    for (let i = 1; i <= 100; i += 1) {
      await w.jobs.finishJob(finished({ contentId: 1000 + i }));
    }
    expect(w.area.ops.filter((op) => op === "set:settings")).toHaveLength(1);
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:1001",
      outcome: "failed",
      error: "finish-limit",
    });
  });

  it("over the limit, a message the state decides is still free: no refusal is recorded", async () => {
    const finishWindow = { from: NOW - 10, count: MAX_FINISHES_PER_WINDOW };
    const w = world({
      settings: { mode: "live", finishWindow },
      state: { ...emptyState(), threshold: 0.9, handled: ["movie:1"] },
    });
    await w.jobs.finishJob(finished({ progress: 0.5 }));
    await w.jobs.finishJob(
      finished({ contentId: 1, source: "explicit", progress: 1 }),
    );
    expect(w.area.ops.filter((op) => op.startsWith("set"))).toEqual([]);
    expect(w.settings()).toEqual({ mode: "live", finishWindow });
  });

  it("an explicit vu below the threshold is complete: the pre-check lets it through", async () => {
    const w = world({ state: { ...emptyState(), threshold: 0.9 } });
    await w.jobs.finishJob(finished({ source: "explicit", progress: 0.2 }));
    expect(writesOf(w.sk.calls)).toEqual(["markDone:1003:2026-11-04"]);
    expect(w.settings().finishWindow).toEqual({ from: NOW, count: 1 });
  });

  it("another failure in the window does not silence a refusal", async () => {
    const failed = {
      at: NOW - 5,
      key: "movie:9",
      outcome: "failed",
      error: "sc-session",
    } as const;
    const w = world({
      settings: {
        mode: "live",
        finishWindow: { from: NOW - 10, count: MAX_FINISHES_PER_WINDOW },
        lastFinish: failed,
      },
    });
    await w.jobs.finishJob(finished());
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:3",
      outcome: "failed",
      error: "finish-limit",
    });
  });

  it("a refusal from an earlier window does not silence a new one", async () => {
    const earlier = {
      at: NOW - 20,
      key: "movie:9",
      outcome: "failed",
      error: "finish-limit",
    } as const;
    const w = world({
      settings: {
        mode: "live",
        finishWindow: { from: NOW - 10, count: MAX_FINISHES_PER_WINDOW },
        lastFinish: earlier,
      },
    });
    await w.jobs.finishJob(finished());
    expect(w.settings().lastFinish).toEqual({
      at: NOW,
      key: "movie:3",
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
    const names: string[] = [];
    const dies = () => {
      calls += 1;
      return calls === k;
    };
    const guard = <T extends object>(target: T, label: string): T =>
      new Proxy(target, {
        get(object, key) {
          const value = Reflect.get(object, key);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            names.push(`${label}.${String(key)}`);
            return dies() ? never() : Reflect.apply(value, object, args);
          };
        },
      });
    const area = memoryArea();
    const nk = fakeNaka(catalogueNaka());
    const jobs = createJobs({
      store: createStore(guard(area, "area")),
      tabs: guard(tabRunning(nk.client, () => "77").tabs, "tabs"),
      sc: guard(fakeSc(catalogueSc()).client, "sc"),
      scUsername: () => (dies() ? never() : Promise.resolve("owner")),
      limiters: {
        naka: guard(countingLimiter([], "naka"), "limit"),
        sc: guard(countingLimiter([], "sc"), "limit"),
      },
      now: () => NOW,
      today: () => "2026-11-04",
      timer: { set: () => 0, clear: () => undefined },
    });
    return { jobs, area, names, calls: () => calls };
  }

  const savedStates = (area: ReturnType<typeof memoryArea>) =>
    area.sets.flatMap((set) =>
      "state" in set ? [JSON.stringify(set.state)] : [],
    );

  it("a finish killed after it reserved its slot leaves exactly that one count", async () => {
    const full = killedAt(0);
    await full.jobs.finishJob(finished());
    const reservation = full.names.indexOf("area.set") + 1;
    expect(full.names.slice(0, reservation)).toEqual([
      "area.get",
      "area.get",
      "area.set",
    ]);
    for (let k = 1; k <= full.calls(); k += 1) {
      const w = killedAt(k);
      void w.jobs.finishJob(finished());
      await settle();
      const settings = w.area.data.get("settings");
      const window =
        settings === undefined
          ? undefined
          : parseSettings(settings).finishWindow;
      expect(window).toEqual(
        k > reservation ? { from: NOW, count: 1 } : undefined,
      );
    }
  });

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

  it("a finish leaves the state it found, the settled pair, or the handled key, and the next finish completes from it", async () => {
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
      const handled =
        state !== undefined && parseState(state).handled.length > 0;
      const next = jobsOn(w.area);
      await next.jobs.finishJob(finished());
      expect(parseState(w.area.data.get("state")).handled).toEqual(["movie:3"]);
      expect(
        parseSettings(w.area.data.get("settings")).lastFinish?.outcome,
      ).toBe(handled ? undefined : "done");
      expect(writesOf(next.sk.calls)).toEqual(
        handled ? [] : ["markDone:1003:2026-11-04"],
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
