import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FinishedMessage } from "../src/content/playback-tracker";
import { emptyState } from "../src/core/state";
import { MAX_FINISHES_PER_WINDOW } from "../src/ext/finish-window";
import { type Mode, parseSettings } from "../src/ext/settings";
import { createStore } from "../src/ext/store";
import { createNakaClient } from "../src/naka/naka-client";
import type { Fetch } from "../src/sc/sc-client";
import { MAX_QUEUED_FINISHES } from "../src/sw/finish-queue";
import { createJobQueue } from "../src/sw/job-queue";
import {
  createJobs,
  type Jobs,
  type StatusSnapshot,
  type Trigger,
} from "../src/sw/jobs";
import type { TabsPort, Timer } from "../src/sw/naka-proxy";
import { createRouter } from "../src/sw/router";
import { PLAYLIST_DEBOUNCE_MS } from "../src/sw/run-throttle";
import { createWorker } from "../src/sw/worker";
import { strings, tabRunning } from "./naka-bridge-fakes";
import { countingLimiter, fakeNaka, fakeSc, memoryArea } from "./sw-fakes";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const STATUS_URL = `chrome-extension://${EXT}/status.html`;
const PLAYER = "https://naka.cx/player?id=3&type=movie";

const NAKA_TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
const STATUS_PAGE = { id: EXT, url: STATUS_URL, tab: { url: STATUS_URL } };
const EVIL = {
  id: EXT,
  url: "https://naka.cx.evil.com/",
  frameId: 0,
  tab: { url: "https://naka.cx.evil.com/" },
};
const IFRAME = { ...NAKA_TAB, frameId: 3 };
const OTHER_EXTENSION = { ...NAKA_TAB, id: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" };

const FINISHED = {
  type: "finished",
  source: "threshold",
  progress: 0.9,
  contentId: 3,
};

function fakeTimer() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 0;
  const timer: Timer = {
    set: (fn, ms) => {
      next += 1;
      pending.set(next, { fn, ms });
      return next;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  const fire = () => {
    const due = [...pending.values()];
    pending.clear();
    for (const { fn } of due) fn();
  };
  return { timer, pending, fire };
}

function recordingJobs(over: Partial<Jobs> = {}) {
  const calls: string[] = [];
  const snapshot: StatusSnapshot = { mode: "simulation" };
  const jobs: Jobs = {
    syncJob: async (trigger: Trigger) => {
      calls.push(`sync:${trigger}`);
    },
    finishJob: async (msg: FinishedMessage) => {
      calls.push(`finish:${JSON.stringify(msg)}`);
    },
    setMode: async (mode: Mode) => {
      calls.push(`mode:${mode}`);
    },
    statusSnapshot: async () => {
      calls.push("status");
      return snapshot;
    },
    ...over,
  };
  return { jobs, calls, snapshot };
}

function router(over: Partial<Jobs> = {}) {
  const recorded = recordingJobs(over);
  const clock = fakeTimer();
  const answers: unknown[] = [];
  const r = createRouter({
    extensionId: EXT,
    queue: createJobQueue(),
    jobs: recorded.jobs,
    timer: clock.timer,
  });
  const send = (msg: unknown, sender: object) =>
    r.handle(msg, sender, (answer) => answers.push(answer));
  return { ...recorded, ...clock, answers, send };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("router: trusted messages become jobs", () => {
  it("naka-ready from the Naka tab starts an automatic sync, unanswered", async () => {
    const r = router();
    expect(r.send({ type: "naka-ready" }, NAKA_TAB)).toBe(false);
    await settle();
    expect(r.calls).toEqual(["sync:naka-ready"]);
    expect(r.answers).toEqual([]);
  });

  it("playlist-changed is debounced: one sync, 5 s after the last change", async () => {
    const r = router();
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    await settle();
    expect(r.calls).toEqual([]);
    expect([...r.pending.values()].map((p) => p.ms)).toEqual([
      PLAYLIST_DEBOUNCE_MS,
    ]);
    r.fire();
    await settle();
    expect(r.calls).toEqual(["sync:playlist"]);
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    r.fire();
    await settle();
    expect(r.calls).toEqual(["sync:playlist", "sync:playlist"]);
  });

  it("resync from the status page is the button", async () => {
    const r = router();
    r.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual(["sync:button"]);
  });

  it("finished from the Naka tab gives the parsed message to the finish job", async () => {
    const r = router();
    r.send({ ...FINISHED, title: "forged", token: "x" }, NAKA_TAB);
    await settle();
    expect(r.calls).toEqual([`finish:${JSON.stringify(FINISHED)}`]);
  });

  it("set-mode from the status page saves the mode", async () => {
    const r = router();
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual(["mode:live"]);
  });

  it("status from the status page is answered with the snapshot", async () => {
    const r = router();
    expect(r.send({ type: "status" }, STATUS_PAGE)).toBe(true);
    await settle();
    expect(r.calls).toEqual(["status"]);
    expect(r.answers).toEqual([r.snapshot]);
  });

  it("a status page without a tab is trusted too", async () => {
    const r = router();
    r.send({ type: "status" }, { id: EXT, url: STATUS_URL });
    await settle();
    expect(r.answers).toHaveLength(1);
  });
});

describe("router: everything else is ignored, unanswered", () => {
  const ignored: [string, unknown, object][] = [
    ["a message from https://naka.cx.evil.com/", { type: "naka-ready" }, EVIL],
    ["a finished from https://naka.cx.evil.com/", FINISHED, EVIL],
    ["a message from an iframe", FINISHED, IFRAME],
    ["a message from another extension", FINISHED, OTHER_EXTENSION],
    ["a sender with no id", { type: "status" }, { url: STATUS_URL }],
    ["an unknown type", { type: "reset" }, STATUS_PAGE],
    ["a malformed finished", { ...FINISHED, progress: 2 }, NAKA_TAB],
    ["not an object", "naka-ready", NAKA_TAB],
    [
      "set-mode from the Naka tab",
      { type: "set-mode", mode: "live" },
      NAKA_TAB,
    ],
    ["resync from the Naka tab", { type: "resync" }, NAKA_TAB],
    ["status from the Naka tab", { type: "status" }, NAKA_TAB],
    ["naka-ready from the status page", { type: "naka-ready" }, STATUS_PAGE],
    ["finished from the status page", FINISHED, STATUS_PAGE],
    [
      "playlist-changed from the status page",
      { type: "playlist-changed" },
      STATUS_PAGE,
    ],
  ];

  it.each(ignored)("%s", async (_name, msg, sender) => {
    const r = router();
    expect(r.send(msg, sender)).toBe(false);
    r.fire();
    await settle();
    expect(r.calls).toEqual([]);
    expect(r.answers).toEqual([]);
  });

  it("the message is parsed before the sender is looked at", () => {
    const read: string[] = [];
    const sender = new Proxy(NAKA_TAB, {
      get(target, key, receiver) {
        read.push(String(key));
        return Reflect.get(target, key, receiver);
      },
    });
    const r = router();
    r.send({ type: "nothing" }, sender);
    expect(read).toEqual([]);
    r.send({ type: "naka-ready" }, sender);
    expect(read).toContain("id");
  });
});

function latch() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

const finishedFor = (
  contentId: number,
  progress = 0.9,
  extra: Record<string, unknown> = {},
) => ({ type: "finished", source: "threshold", progress, contentId, ...extra });

const finishes = (calls: string[]) =>
  calls.filter((call) => call.startsWith("finish:"));

describe("router: finishes are bounded", () => {
  it("a burst of 1000 distinct ids queues at most 20 finish jobs, unanswered", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    for (let id = 1; id <= 1000; id += 1) {
      expect(r.send(finishedFor(id), NAKA_TAB)).toBe(false);
    }
    blocker.open();
    await settle();
    expect(finishes(r.calls)).toHaveLength(MAX_QUEUED_FINISHES);
    expect(r.answers).toEqual([]);
  });

  it("a slot frees up when a finish job ends", async () => {
    const r = router();
    for (let id = 1; id <= 25; id += 1) r.send(finishedFor(id), NAKA_TAB);
    await settle();
    for (let id = 26; id <= 30; id += 1) r.send(finishedFor(id), NAKA_TAB);
    await settle();
    expect(finishes(r.calls)).toHaveLength(MAX_QUEUED_FINISHES + 5);
  });

  it("duplicates of a queued key give one job, run with the highest progress received", async () => {
    const blocker = latch();
    const r = router({
      syncJob: async () => {
        await blocker.opened;
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send(finishedFor(3, 0.85), NAKA_TAB);
    r.send(finishedFor(3, 0.95), NAKA_TAB);
    r.send(finishedFor(3, 0.95, { source: "explicit" }), NAKA_TAB);
    r.send(finishedFor(3, 0.9), NAKA_TAB);
    r.send(finishedFor(7, 0.9, { season: 1, episode: 1 }), NAKA_TAB);
    r.send(finishedFor(7, 0.9, { season: 1, episode: 2 }), NAKA_TAB);
    blocker.open();
    await settle();
    expect(finishes(r.calls)).toEqual([
      `finish:${JSON.stringify(finishedFor(3, 0.95, { source: "explicit" }))}`,
      `finish:${JSON.stringify(finishedFor(7, 0.9, { season: 1, episode: 1 }))}`,
      `finish:${JSON.stringify(finishedFor(7, 0.9, { season: 1, episode: 2 }))}`,
    ]);
  });

  it("a message for a key whose job is running is queued, and runs after it", async () => {
    const running = latch();
    const progresses: number[] = [];
    const r = router({
      finishJob: async (msg) => {
        progresses.push(msg.progress);
        if (progresses.length === 1) await running.opened;
      },
    });
    r.send(finishedFor(3, 0.85), NAKA_TAB);
    await settle();
    expect(progresses).toEqual([0.85]);
    r.send(finishedFor(3, 0.9), NAKA_TAB);
    running.open();
    await settle();
    expect(progresses).toEqual([0.85, 0.9]);
  });
});

// The router on the REAL jobs, with fake sites that know every content id.
function floodWorld(threshold = 0.9) {
  const area = memoryArea();
  area.data.set("state", { ...emptyState(), threshold });
  const naka = fakeNaka({
    playlistIds: async () => [],
    contentById: async (id) => ({
      contentId: id,
      tmdbId: 9000 + id,
      mediaType: "movie",
      title: `Film ${id}`,
      releaseDate: "2001-01-01",
    }),
  });
  const sc = fakeSc({
    search: async (q, universe) =>
      universe === "movie"
        ? [
            {
              productId: 100000 + Number(q.slice(5)),
              title: q,
              url: "/film/x",
              universe: 1,
              year: 2001,
            },
          ]
        : [],
  });
  const blocker = latch();
  let first = true;
  const real = tabRunning(naka.client, () => "77").tabs;
  const tabs: TabsPort = {
    query: async (url) => {
      if (first) {
        first = false;
        await blocker.opened;
      }
      return real.query(url);
    },
    send: (tabId, msg) => real.send(tabId, msg),
  };
  const jobs = createJobs({
    store: createStore(area),
    tabs,
    sc: sc.client,
    scUsername: async () => "owner",
    limiters: { naka: countingLimiter([], "n"), sc: countingLimiter([], "s") },
    now: () => Date.parse("2026-11-04T12:00:00Z"),
    today: () => "2026-11-04",
    timer: { set: () => 0, clear: () => undefined },
  });
  const r = createRouter({
    extensionId: EXT,
    queue: createJobQueue(),
    jobs,
    timer: fakeTimer().timer,
  });
  const send = (msg: unknown, sender: object) =>
    r.handle(msg, sender, () => undefined);
  return { area, sc, blocker, send };
}

describe("router and jobs: a forged flood", () => {
  it("at most 30 finishes an hour reach handleFinish", async () => {
    const w = floodWorld();
    w.blocker.open();
    for (let round = 0; round < 3; round += 1) {
      for (let id = 1; id <= 1000; id += 1) {
        w.send(
          finishedFor(round * 1000 + id, 1, { source: "explicit" }),
          NAKA_TAB,
        );
      }
      await settle();
    }
    const loads = w.area.ops.filter((op) => op === "get:state");
    expect(loads).toHaveLength(MAX_FINISHES_PER_WINDOW);
    expect(w.sc.calls.filter((c) => c.startsWith("markDone"))).toHaveLength(30);
    expect(parseSettings(w.area.data.get("settings")).lastFinish?.error).toBe(
      "finish-limit",
    );
  });

  it("a 0.85 mark queued behind a sync, then the 0.9 mark, under a 0.9 threshold: the finish completes", async () => {
    const w = floodWorld(0.9);
    w.send({ type: "resync" }, STATUS_PAGE);
    w.send(finishedFor(3, 0.85), NAKA_TAB);
    w.send(finishedFor(3, 0.9), NAKA_TAB);
    w.blocker.open();
    await settle();
    expect(w.sc.calls).toContain("markDone:100003:2026-11-04");
    expect(parseSettings(w.area.data.get("settings")).lastFinish).toMatchObject(
      {
        key: "movie:3",
        outcome: "done",
      },
    );
  });
});

describe("router: one queue", () => {
  function gate() {
    let open: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { opened, open };
  }

  it("a job starts only after the one before it ended", async () => {
    const first = gate();
    const events: string[] = [];
    const r = router({
      syncJob: async () => {
        events.push("sync start");
        await first.opened;
        events.push("sync end");
      },
      finishJob: async () => {
        events.push("finish start");
      },
      statusSnapshot: async () => {
        events.push("status");
        return {};
      },
      setMode: async () => {
        events.push("mode");
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send(FINISHED, NAKA_TAB);
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    r.send({ type: "status" }, STATUS_PAGE);
    await settle();
    expect(events).toEqual(["sync start"]);
    first.open();
    await settle();
    expect(events).toEqual([
      "sync start",
      "sync end",
      "finish start",
      "mode",
      "status",
    ]);
  });

  it("a debounced sync waits for the queue too", async () => {
    const first = gate();
    const events: string[] = [];
    const r = router({
      finishJob: async () => {
        events.push("finish start");
        await first.opened;
        events.push("finish end");
      },
      syncJob: async (trigger) => {
        events.push(`sync ${trigger}`);
      },
    });
    r.send(FINISHED, NAKA_TAB);
    r.send({ type: "playlist-changed" }, NAKA_TAB);
    r.fire();
    await settle();
    expect(events).toEqual(["finish start"]);
    first.open();
    await settle();
    expect(events).toEqual(["finish start", "finish end", "sync playlist"]);
  });

  it("a job that rejects does not stop the next one", async () => {
    const r = router({
      syncJob: async () => {
        throw new Error("boom");
      },
    });
    r.send({ type: "resync" }, STATUS_PAGE);
    r.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    await settle();
    expect(r.calls).toEqual(["mode:live"]);
  });

  it("a snapshot that rejects is not answered", async () => {
    const r = router({
      statusSnapshot: async () => {
        throw new Error("boom");
      },
    });
    expect(r.send({ type: "status" }, STATUS_PAGE)).toBe(true);
    await settle();
    expect(r.answers).toEqual([]);
  });
});

// End to end through createWorker: the real SensCritique client and session reader on a fake fetch, the
// real Naka client inside a fake tab. Both tokens are markers that must stay where they belong.
const SC_TOKEN = "SCTOKENMARKER0123456789abcdefXY";
const NAKA_TOKEN = "NAKA-TOKEN-MARKER-5e1f";

type Call = { url: string; init: Parameters<Fetch>[1]; at: number };
type Clock = { time: number };

const json = (value: unknown, status = 200) => ({
  ok: status === 200,
  status,
  text: async () => JSON.stringify(value),
});

function homePage(loggedIn: boolean): string {
  const pageProps = loggedIn
    ? { cookies: { SC_AUTH: SC_TOKEN }, meInfos: { username: "owner" } }
    : {};
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    { props: { pageProps } },
  )}</script></body></html>`;
}

const scProduct = (id: number) => ({
  id,
  title: `Film ${id - 1000}`,
  url: `/film/x/${id}`,
  universe: 1,
  dateRelease: `${2000 + id - 1000}-01-01`,
});

function apollo(body: {
  operationName: string;
  variables: Record<string, unknown>;
}) {
  const { operationName, variables } = body;
  if (operationName === "UserCollection") {
    const products = variables.universe === "movie" ? [scProduct(1002)] : [];
    return json({
      data: { user: { collection: { products, total: products.length } } },
    });
  }
  if (operationName === "SearchProductExplorer") {
    const films = JSON.stringify(variables.filters).includes("movie");
    const found = { "Film 1": 1001, "Film 3": 1003 }[String(variables.query)];
    const items = films && found !== undefined ? [scProduct(found)] : [];
    return json({ data: { searchProductExplorer: { items } } });
  }
  if (operationName === "ProductCurrentUserInfos") {
    const id = variables.id as number;
    return json({
      data: {
        product: {
          id,
          universe: 1,
          currentUserInfos: {
            productId: id,
            isDone: false,
            isWished: id === 1002,
          },
        },
      },
    });
  }
  return json({ data: { [operationName]: { ok: true } } });
}

function scFetch(loggedIn: boolean, clock: Clock) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init, at: clock.time });
    if (url === "https://www.senscritique.com/") {
      return { ok: true, status: 200, text: async () => homePage(loggedIn) };
    }
    if (url === "https://apollo.senscritique.com/") {
      return apollo(JSON.parse(init.body ?? "{}"));
    }
    return json({}, 404);
  };
  return { fetch, calls };
}

const nakaEntry = (id: number) => ({
  id,
  tmdbId: 9000 + id,
  mediaType: "movie",
  title: `Film ${id}`,
  releaseDate: `${2000 + id}-01-01`,
});

function nakaFetch(clock: Clock) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init, at: clock.time });
    const path = url.replace("https://naka.cx/api/v1", "");
    if (path === "/playlist/ids") return json({ contentIds: [1], limit: 500 });
    if (path.startsWith("/browse/search")) {
      return json({ data: path.includes("Film%202") ? [nakaEntry(2)] : [] });
    }
    if (path === "/browse/1") return json(nakaEntry(1));
    if (path === "/browse/3") return json(nakaEntry(3));
    if (path === "/playlist" && init.method === "POST") return json({});
    return json({}, 404);
  };
  return { fetch, calls };
}

function worker(loggedIn = true, start = "2026-11-04T12:00:00Z") {
  const clock: Clock = { time: Date.parse(start) };
  const storage = memoryArea();
  const sc = scFetch(loggedIn, clock);
  const naka = nakaFetch(clock);
  const client = createNakaClient({
    fetch: naka.fetch,
    token: () => NAKA_TOKEN,
  });
  const traffic = { sent: [] as unknown[], returned: [] as unknown[] };
  const { tabs } = tabRunning(client, () => "77", traffic);
  const answers: unknown[] = [];
  const r = createWorker({
    extensionId: EXT,
    storage,
    tabs,
    fetch: sc.fetch,
    timer: { set: () => 0, clear: () => undefined },
    now: () => clock.time,
    sleep: async (ms) => {
      clock.time += ms;
    },
  });
  const send = (msg: unknown, sender: object) =>
    r.handle(msg, sender, (answer) => answers.push(answer));
  return { storage, sc, naka, traffic, answers, send };
}

describe("worker end to end: a SensCritique request that never answers", () => {
  it.each([
    "https://www.senscritique.com/",
    "https://apollo.senscritique.com/",
  ])(
    "to %s is aborted at 30 s, the run fails as unavailable, and the next job runs",
    async (stuck) => {
      const storage = memoryArea();
      const armed: { fn: () => void; ms: number }[] = [];
      const timer: Timer = {
        set: (fn, ms) => {
          armed.push({ fn, ms });
          return armed.length;
        },
        clear: () => undefined,
      };
      const signals: AbortSignal[] = [];
      const answering = scFetch(true, { time: 0 }).fetch;
      const hanging: Fetch = (url, init) =>
        url !== stuck
          ? answering(url, init)
          : new Promise((_resolve, reject) => {
              if (init.signal) signals.push(init.signal);
              init.signal?.addEventListener("abort", () =>
                reject(new Error("aborted")),
              );
            });
      const client = createNakaClient({
        fetch: nakaFetch({ time: 0 }).fetch,
        token: () => NAKA_TOKEN,
      });
      const answers: unknown[] = [];
      const r = createWorker({
        extensionId: EXT,
        storage,
        tabs: tabRunning(client, () => "77").tabs,
        fetch: hanging,
        timer,
        now: () => Date.parse("2026-11-04T12:00:00Z"),
        sleep: async () => undefined,
      });
      r.handle({ type: "resync" }, STATUS_PAGE, () => undefined);
      r.handle({ type: "status" }, STATUS_PAGE, (a) => answers.push(a));
      await settle();
      expect(answers).toEqual([]);
      expect(signals).toHaveLength(1);
      const abort = armed.filter((a) => a.ms === 30_000);
      expect(abort.length).toBeGreaterThan(0);
      for (const { fn } of abort) fn();
      await settle();
      expect(answers).toHaveLength(1);
      expect((answers[0] as StatusSnapshot).lastRun).toMatchObject({
        trigger: "button",
        outcome: "failed",
        error: "unavailable",
      });
    },
  );
});

describe("worker end to end: the tokens stay where they belong", () => {
  it("a live sync writes, and neither token reaches storage, a message or an answer", async () => {
    const w = worker();
    w.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    w.send({ type: "naka-ready" }, NAKA_TAB);
    w.send({ type: "status" }, STATUS_PAGE);
    await settle();
    const ops = w.sc.calls.map(
      (c) => JSON.parse(c.init.body ?? "{}").operationName,
    );
    expect(ops).toContain("ProductWish");
    expect(w.naka.calls.some((c) => c.init.method === "POST")).toBe(true);

    const stored = strings([...w.storage.data.values()]);
    const shown = strings(w.answers);
    const crossed = strings([w.traffic.sent, w.traffic.returned]);
    for (const token of [SC_TOKEN, NAKA_TOKEN]) {
      expect(stored.some((s) => s.includes(token))).toBe(false);
      expect(shown.some((s) => s.includes(token))).toBe(false);
      expect(crossed.some((s) => s.includes(token))).toBe(false);
    }
    expect(w.answers).toHaveLength(1);
  });

  it("the SensCritique token goes only to Apollo, as the raw authorization header, without cookies", async () => {
    const w = worker();
    w.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    w.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    for (const { url, init } of w.sc.calls) {
      const carries =
        JSON.stringify(init).includes(SC_TOKEN) || url.includes(SC_TOKEN);
      if (!carries) continue;
      expect(url).toBe("https://apollo.senscritique.com/");
      expect(init.headers.authorization).toBe(SC_TOKEN);
      expect(init.credentials).toBe("omit");
      expect(init.body ?? "").not.toContain(SC_TOKEN);
    }
    expect(
      w.sc.calls.some((c) => c.init.headers.authorization === SC_TOKEN),
    ).toBe(true);
    for (const { url, init } of w.naka.calls) {
      expect(url.startsWith("https://naka.cx/api/v1/")).toBe(true);
      expect(init.headers.authorization).toBe(`Bearer ${NAKA_TOKEN}`);
      expect(url).not.toContain(NAKA_TOKEN);
      expect(init.body ?? "").not.toContain(NAKA_TOKEN);
    }
  });

  it("a logged-out SensCritique home page gives sc-session, with no SensCritique write", async () => {
    const w = worker(false);
    w.send({ type: "set-mode", mode: "live" }, STATUS_PAGE);
    w.send({ type: "resync" }, STATUS_PAGE);
    w.send({ type: "status" }, STATUS_PAGE);
    await settle();
    expect(
      w.sc.calls.every((c) => c.url === "https://www.senscritique.com/"),
    ).toBe(true);
    expect(w.naka.calls.some((c) => c.init.method === "POST")).toBe(false);
    const snapshot = w.answers[0] as StatusSnapshot;
    expect(snapshot.lastRun).toMatchObject({
      outcome: "failed",
      error: "sc-session",
    });
  });

  it("a logged-out SensCritique home page stops a finish after the content read, before the state is read", async () => {
    const w = worker(false);
    w.send({ ...FINISHED, contentId: 3 }, NAKA_TAB);
    await settle();
    expect(w.storage.ops).not.toContain("get:state");
    expect(w.naka.calls.map((c) => c.url)).toEqual([
      "https://naka.cx/api/v1/browse/3",
    ]);
    expect(w.sc.calls.map((c) => c.url)).toEqual([
      "https://www.senscritique.com/",
    ]);
    expect(w.storage.data.get("settings")).toMatchObject({
      lastFinish: { key: "movie:3", outcome: "failed", error: "sc-session" },
    });
  });
});

describe("worker end to end: the shared limiters", () => {
  const spacing = (calls: Call[]) =>
    calls.slice(1).map((call, i) => call.at - (calls[i] as Call).at);

  it("SensCritique searches and Naka reads are each 2 s apart", async () => {
    const w = worker();
    w.send({ type: "resync" }, STATUS_PAGE);
    await settle();
    const searches = w.sc.calls.filter((c) =>
      (c.init.body ?? "").includes("SearchProductExplorer"),
    );
    const reads = w.naka.calls.filter((c) => c.url.includes("/browse/"));
    expect(searches).toHaveLength(2);
    expect(reads).toHaveLength(2);
    for (const gap of [...spacing(searches), ...spacing(reads)]) {
      expect(gap).toBeGreaterThanOrEqual(2000);
    }
  });
});

describe("worker end to end: a finish is dated in the owner's time zone", () => {
  const before = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Pacific/Kiritimati";
  });

  afterAll(() => {
    process.env.TZ = before;
  });

  it("10:30 UTC on 4 November is the 5th in Kiritimati", async () => {
    const w = worker(true, "2026-11-04T10:30:00Z");
    w.send({ ...FINISHED, contentId: 3 }, NAKA_TAB);
    await settle();
    const dated = w.sc.calls
      .map((c) => JSON.parse(c.init.body ?? "{}"))
      .find((body) => body.operationName === "SetProductDateDone");
    expect(dated?.variables).toEqual({ productId: 1003, date: "2026-11-05" });
  });
});
