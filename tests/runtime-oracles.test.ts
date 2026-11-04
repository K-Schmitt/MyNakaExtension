import { describe, expect, it } from "vitest";
import type { FinishedMessage } from "../src/content/playback-tracker";
import { emptyState } from "../src/core/state";
import type { Jobs } from "../src/sw/jobs";
import {
  answerStatus,
  clockFor,
  createWorld,
  LIVE_TAB,
  observed,
  oracleOf,
  ownerEdit,
  scFor,
  sentFinish,
  setThresholds,
  storageFor,
  tabsFor,
  type World,
} from "./runtime-world";

// Positive controls of the runtime fuzz's oracles (tests/runtime-world.ts): for each one, a hand-made trace
// that breaks its rule must make it fire, and a clean trace must not. Without these, a green fuzz could
// mean an oracle that can never fire.

const ORPHAN = 101;

// A world with no randomness left: no flaky write, no failing storage, no orphan tab, nothing stored.
function quietWorld(): World {
  const w = createWorld(1);
  w.r = () => 0.5;
  w.failRate = 0;
  w.orphans = [];
  w.storage.clear();
  return w;
}

const fired = (w: World): string[] => w.violations.map(oracleOf);

function latch() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

function fakeJobs(over: Partial<Jobs> = {}): Jobs {
  return {
    syncJob: async () => undefined,
    finishJob: async () => undefined,
    setMode: async () => undefined,
    statusSnapshot: async () => ({}),
    ...over,
  };
}

const live = (w: World, extra: Record<string, unknown> = {}) =>
  w.storage.set("settings", { mode: "live", ...extra });

const film = (
  source: FinishedMessage["source"],
  progress: number,
): FinishedMessage => ({ type: "finished", source, progress, contentId: 1 });

const episode = (
  source: FinishedMessage["source"],
  progress: number,
): FinishedMessage => ({
  type: "finished",
  source,
  progress,
  contentId: 1,
  season: 1,
  episode: 2,
});

const same = (threshold: number) => ({ film: threshold, episode: threshold });

// A finish job running for `msg`, which a Naka tab sent.
function finishing(w: World, msg: FinishedMessage): void {
  sentFinish(w, msg);
  w.current = { kind: "finish", msg };
}

describe("O1 never two jobs at once", () => {
  it("fires when two jobs overlap", async () => {
    const w = quietWorld();
    w.allowed.set("sync:button", 2);
    const gate = latch();
    const jobs = observed(w, 0, fakeJobs({ syncJob: () => gate.opened }));
    const both = Promise.all([jobs.syncJob("button"), jobs.syncJob("button")]);
    gate.open();
    await both;
    expect(fired(w)).toEqual(["O1 two jobs at once"]);
  });

  it("stays silent for jobs one after the other, and for a status answer during a job", async () => {
    const w = quietWorld();
    w.allowed.set("sync:button", 2);
    w.allowed.set("status", 1);
    const gate = latch();
    const jobs = observed(w, 0, fakeJobs({ syncJob: () => gate.opened }));
    const first = jobs.syncJob("button");
    await jobs.statusSnapshot();
    gate.open();
    await first;
    await jobs.syncJob("button");
    expect(w.violations).toEqual([]);
  });
});

describe("O2 stored values always parse", () => {
  it("fires on an invalid state and on invalid settings", async () => {
    const w = quietWorld();
    const area = storageFor(w, 0);
    await area.set({ state: { ...emptyState(), threshold: 2 } });
    await area.set({ settings: { mode: "paused" } });
    expect(fired(w)).toEqual(["O2 invalid storage", "O2 invalid storage"]);
  });

  it("stays silent on valid ones", async () => {
    const w = quietWorld();
    await storageFor(w, 0).set({
      state: emptyState(),
      settings: { mode: "live" },
    });
    expect(w.violations).toEqual([]);
  });
});

describe("O3 no list write in simulation", () => {
  it("fires on a wish while the stored mode is simulation", async () => {
    const w = quietWorld();
    w.storage.set("settings", { mode: "simulation" });
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    expect(fired(w)).toEqual(["O3 write in simulation"]);
  });

  it("stays silent in live mode", async () => {
    const w = quietWorld();
    live(w);
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    expect(w.violations).toEqual([]);
  });
});

describe("O4 no write and no state save for other accounts", () => {
  it("fires on a wish and on a state save while another account is signed in", async () => {
    const w = quietWorld();
    live(w, { binding: { scUsername: "owner" } });
    w.scAccount = "other";
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    await storageFor(w, 0).set({ state: emptyState() });
    expect(fired(w)).toEqual(["O4 binding", "O4 binding"]);
  });

  it("stays silent for the bound accounts", async () => {
    const w = quietWorld();
    live(w, { binding: { scUsername: "owner", nakaAccount: "77" } });
    w.current = { kind: "sync" };
    await scFor(w, 0).wish(1001);
    await storageFor(w, 0).set({ state: emptyState() });
    expect(w.violations).toEqual([]);
  });
});

describe("O5 no re-add after the owner removed a title", () => {
  function addFilmOne(w: World) {
    w.current = { kind: "sync", found: [LIVE_TAB], tried: new Set() };
    return tabsFor(w, 0).send(LIVE_TAB, {
      type: "naka-call",
      call: "add",
      contentId: 1,
    });
  }

  it("fires when a title seen in both lists, then removed from Naka, is added back", async () => {
    const w = quietWorld();
    live(w);
    w.playlist.add(1);
    w.wishlist.add(1001);
    w.seenBoth.add(1);
    ownerEdit(w, 1, "naka");
    await addFilmOne(w);
    expect(fired(w)).toEqual(["O5 re-add"]);
  });

  it("stays silent when no completed run had seen it in both", async () => {
    const w = quietWorld();
    live(w);
    w.playlist.add(1);
    w.wishlist.add(1001);
    ownerEdit(w, 1, "naka");
    await addFilmOne(w);
    expect(w.violations).toEqual([]);
  });
});

describe("O6 no re-wish of a film its finish settled", () => {
  async function markFilmOneDone(w: World) {
    finishing(w, film("explicit", 1));
    await scFor(w, 0).markDone(1001, "2026-11-04");
    w.current = { kind: "sync" };
  }

  it("fires on a wish of the film after its markDone", async () => {
    const w = quietWorld();
    live(w);
    await markFilmOneDone(w);
    await scFor(w, 0).wish(1001);
    expect(fired(w)).toEqual(["O6 re-wish"]);
  });

  it("stays silent for another film", async () => {
    const w = quietWorld();
    live(w);
    await markFilmOneDone(w);
    await scFor(w, 0).wish(1002);
    expect(w.violations).toEqual([]);
  });
});

describe("O7 a job or a status answer only for a message its sender may send", () => {
  it("fires on a job, and on a status answer, that no message allowed", async () => {
    const w = quietWorld();
    const jobs = observed(w, 0, fakeJobs());
    await jobs.syncJob("button");
    await jobs.statusSnapshot();
    expect(fired(w)).toEqual(["O7 forged message", "O7 forged message"]);
  });

  it("stays silent for allowed ones", async () => {
    const w = quietWorld();
    w.allowed.set("sync:button", 1);
    w.allowed.set("status", 1);
    const jobs = observed(w, 0, fakeJobs());
    await jobs.syncJob("button");
    await jobs.statusSnapshot();
    expect(w.violations).toEqual([]);
  });
});

describe("O8 forbidden writes", () => {
  it("fires on a rating, an undone, a Naka removal and an unwish of a series", async () => {
    const w = quietWorld();
    const sc = scFor(w, 0);
    await sc.rate(1001, 8);
    await sc.unmarkDone(1001);
    w.current = { kind: "sync", found: [LIVE_TAB], tried: new Set() };
    await tabsFor(w, 0).send(LIVE_TAB, {
      type: "naka-call",
      call: "remove",
      contentId: 1,
    });
    finishing(w, { ...film("explicit", 1), contentId: 11 });
    await sc.unwish(1011);
    expect(fired(w)).toEqual([
      "O8 forbidden write",
      "O8 forbidden write",
      "O8 forbidden write",
      "O8 forbidden write",
    ]);
  });

  it("stays silent on the unwish of a film", async () => {
    const w = quietWorld();
    finishing(w, film("explicit", 1));
    await scFor(w, 0).unwish(1001);
    expect(w.violations).toEqual([]);
  });
});

describe("O9 no finish write once the hour's 30 finishes are spent", () => {
  async function finishWith(count: number) {
    const w = quietWorld();
    live(w, { finishWindow: { from: w.time - 1000, count } });
    finishing(w, film("explicit", 1));
    clockFor(w)();
    await scFor(w, 0).markDone(1001, "2026-11-04");
    return w;
  }

  it("fires on a markDone by a job that started with 30 finishes spent", async () => {
    expect(fired(await finishWith(30))).toEqual(["O9 finish budget"]);
  });

  it("stays silent with 29", async () => {
    expect((await finishWith(29)).violations).toEqual([]);
  });
});

describe("O10 no tabs call once the job lost its tab", () => {
  const ACCOUNT = { type: "naka-account" } as const;

  it("fires on a call after the pinned tab refused a send", async () => {
    const w = quietWorld();
    const tabs = tabsFor(w, 0);
    w.current = { kind: "sync" };
    await tabs.query("https://naka.cx/*");
    await tabs.send(LIVE_TAB, ACCOUNT);
    w.tabOpen = false;
    await expect(tabs.send(LIVE_TAB, ACCOUNT)).rejects.toThrow();
    await tabs.query("https://naka.cx/*");
    expect(fired(w)).toEqual(["O10 lost tab"]);
  });

  it("fires on a call after every tab found refused", async () => {
    const w = quietWorld();
    w.orphans = [ORPHAN];
    w.tabOpen = false;
    const tabs = tabsFor(w, 0);
    w.current = { kind: "sync" };
    await tabs.query("https://naka.cx/*");
    await expect(tabs.send(ORPHAN, ACCOUNT)).rejects.toThrow();
    await expect(tabs.send(ORPHAN, ACCOUNT)).rejects.toThrow();
    expect(fired(w)).toEqual(["O10 lost tab"]);
  });

  it("stays silent while the pinned tab answers, an orphan refused before it", async () => {
    const w = quietWorld();
    w.orphans = [ORPHAN];
    const tabs = tabsFor(w, 0);
    w.current = { kind: "sync" };
    await tabs.query("https://naka.cx/*");
    await expect(tabs.send(ORPHAN, ACCOUNT)).rejects.toThrow();
    await tabs.send(LIVE_TAB, ACCOUNT);
    await tabs.send(LIVE_TAB, ACCOUNT);
    expect(w.violations).toEqual([]);
  });
});

describe("O11 one tab per job, tried in query order", () => {
  const ACCOUNT = { type: "naka-account" } as const;

  async function job(w: World, calls: (string | number)[]) {
    const tabs = tabsFor(w, 0);
    w.current = { kind: "sync" };
    for (const call of calls) {
      if (call === "query") await tabs.query("https://naka.cx/*");
      else await tabs.send(call as number, ACCOUNT).catch(() => undefined);
    }
  }

  it.each([
    ["a send before any query", [LIVE_TAB]],
    ["a try out of query order", ["query", LIVE_TAB]],
    ["a send to another tab once pinned", ["query", ORPHAN, LIVE_TAB, ORPHAN]],
    ["a query once pinned", ["query", ORPHAN, LIVE_TAB, "query"]],
  ] as const)("fires on %s", async (_name, calls) => {
    const w = quietWorld();
    w.orphans = [ORPHAN];
    await job(w, [...calls]);
    expect(fired(w)).toEqual(["O11 one tab per job"]);
  });

  it("stays silent for the query, the tries in order, then the pinned tab only", async () => {
    const w = quietWorld();
    w.orphans = [ORPHAN];
    await job(w, ["query", ORPHAN, LIVE_TAB, LIVE_TAB]);
    expect(w.violations).toEqual([]);
  });
});

describe("O12 a status answer never writes storage", () => {
  it("fires on a write made inside a status answer", async () => {
    const w = quietWorld();
    await answerStatus(() =>
      storageFor(w, 0).set({ settings: { mode: "live" } }),
    );
    expect(fired(w)).toEqual(["O12 read-only status"]);
  });

  it("stays silent for its reads, and for a job's write while an answer waits", async () => {
    const w = quietWorld();
    const area = storageFor(w, 0);
    const gate = latch();
    const answer = answerStatus(async () => {
      await gate.opened;
      return area.get("settings");
    });
    await area.set({ settings: { mode: "live" } });
    gate.open();
    await answer;
    expect(w.violations).toEqual([]);
  });
});

describe("O13 a finish write needs a complete viewing", () => {
  async function markDone(w: World) {
    await scFor(w, 0).markDone(1001, "2026-11-04");
    return fired(w);
  }

  it("fires below the stored threshold", async () => {
    const w = quietWorld();
    setThresholds(w, same(0.9));
    finishing(w, film("threshold", 0.85));
    expect(await markDone(w)).toEqual(["O13 threshold rule"]);
  });

  it("fires for an episode at 0.85 under an episode threshold of 0.9", async () => {
    const w = quietWorld();
    setThresholds(w, { film: 0.8, episode: 0.9 });
    finishing(w, episode("threshold", 0.85));
    expect(await markDone(w)).toEqual(["O13 threshold rule"]);
  });

  it("judges an episode by the episode threshold, a film by the film's", async () => {
    const ep = quietWorld();
    setThresholds(ep, { film: 0.99, episode: 0.8 });
    finishing(ep, episode("threshold", 0.8));
    expect(await markDone(ep)).toEqual([]);
    const fm = quietWorld();
    setThresholds(fm, { film: 0.99, episode: 0.8 });
    finishing(fm, film("threshold", 0.95));
    expect(await markDone(fm)).toEqual(["O13 threshold rule"]);
  });

  it("judges the threshold stored at the write: 0.95 fails under 0.99", async () => {
    const w = quietWorld();
    setThresholds(w, same(0.85));
    finishing(w, film("threshold", 0.95));
    setThresholds(w, same(0.99));
    expect(await markDone(w)).toEqual(["O13 threshold rule"]);
  });

  it("with nothing stored, judges the spec's defaults: 90 % for a film, 80 % for an episode", async () => {
    const low = quietWorld();
    finishing(low, film("threshold", 0.89));
    expect(await markDone(low)).toEqual(["O13 threshold rule"]);
    const high = quietWorld();
    finishing(high, film("threshold", 0.9));
    expect(await markDone(high)).toEqual([]);
    const lowEpisode = quietWorld();
    finishing(lowEpisode, episode("threshold", 0.79));
    expect(await markDone(lowEpisode)).toEqual(["O13 threshold rule"]);
    const highEpisode = quietWorld();
    finishing(highEpisode, episode("threshold", 0.8));
    expect(await markDone(highEpisode)).toEqual([]);
  });

  it("fires on a message no Naka tab sent, and outside a finish job", async () => {
    const forged = quietWorld();
    forged.current = { kind: "finish", msg: film("explicit", 1) };
    expect(await markDone(forged)).toEqual(["O13 threshold rule"]);
    const sync = quietWorld();
    sync.current = { kind: "sync" };
    await scFor(sync, 0).unwish(1001);
    expect(fired(sync)).toEqual(["O13 threshold rule"]);
  });

  it("stays silent for an explicit vu at any progress, and at the threshold", async () => {
    const explicit = quietWorld();
    setThresholds(explicit, same(0.99));
    finishing(explicit, film("explicit", 0.1));
    expect(await markDone(explicit)).toEqual([]);
    const reached = quietWorld();
    setThresholds(reached, same(0.95));
    finishing(reached, film("threshold", 0.95));
    expect(await markDone(reached)).toEqual([]);
  });
});
