import { describe, expect, it } from "vitest";
import { readAccount } from "../src/content/naka-bridge";
import { JobRejected } from "../src/ext/job-error";
import { NakaUnavailableError } from "../src/naka/naka-client";
import {
  createNakaProxy,
  NAKA_CALL_TIMEOUT_MS,
  type TabsPort,
  type Timer,
} from "../src/sw/naka-proxy";
import { pinFirstAnswering } from "../src/sw/pinned-tab";
import {
  clientOn,
  failure,
  fakeApi,
  json,
  MARKER,
  portAnswering,
  standardApi,
  strings,
  tabRunning,
} from "./naka-bridge-fakes";

type LateTab = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type Fake = Timer & {
  pending: Map<number, () => void>;
  delays: number[];
  cleared: number[];
};

function fakeTimer(): Fake {
  const pending = new Map<number, () => void>();
  const delays: number[] = [];
  const cleared: number[] = [];
  return {
    pending,
    delays,
    cleared,
    set: (fn, ms) => {
      const handle = delays.length;
      delays.push(ms);
      pending.set(handle, fn);
      return handle;
    },
    clear: (handle) => {
      cleared.push(handle as number);
      pending.delete(handle as number);
    },
  };
}

const ok = (value?: unknown) =>
  value === undefined ? { ok: true } : { ok: true, value };
const item = (id: number) => ({
  contentId: id,
  tmdbId: 1000 + id,
  mediaType: "tv",
  title: `Titre ${id}`,
});

function proxyAnswering(answer: (m: never) => unknown, timer = fakeTimer()) {
  const port = portAnswering(answer as never);
  return { port, timer, proxy: createNakaProxy(port, timer) };
}

describe("round trip through a fake tab (real tab handler, fake fetch)", () => {
  const account = () =>
    readAccount({
      getItem: () =>
        JSON.stringify({
          state: { token: MARKER, user: { id: 42, email: "e@x.y" } },
        }),
    });

  function both() {
    const direct = clientOn(fakeApi(standardApi).fetch);
    const { tabs, traffic } = tabRunning(
      clientOn(fakeApi(standardApi).fetch),
      account,
    );
    return { direct, proxy: createNakaProxy(tabs, fakeTimer()), traffic };
  }

  it("playlistIds equals the direct client's", async () => {
    const { direct, proxy } = both();
    expect(await proxy.playlistIds()).toStrictEqual(await direct.playlistIds());
  });

  it("search equals the direct client's", async () => {
    const { direct, proxy } = both();
    expect(await proxy.search("  titre ")).toStrictEqual(
      await direct.search("titre"),
    );
  });

  it("contentById equals the direct client's, found or not", async () => {
    const { direct, proxy } = both();
    expect(await proxy.contentById(7)).toStrictEqual(
      await direct.contentById(7),
    );
    expect(await proxy.contentById(8)).toBeUndefined();
    expect(await direct.contentById(8)).toBeUndefined();
  });

  it("availableSeasons equals the direct client's, found or not", async () => {
    const { direct, proxy } = both();
    expect(await proxy.availableSeasons(7)).toStrictEqual(
      await direct.availableSeasons(7),
    );
    expect(await proxy.availableSeasons(7)).toEqual({
      seasons: [1, 2],
      episodeCounts: { 1: 8, 2: 10 },
    });
    expect(await proxy.availableSeasons(8)).toBeUndefined();
    expect(await direct.availableSeasons(8)).toBeUndefined();
  });

  it("add and remove resolve with no value and reach the API", async () => {
    const api = fakeApi(standardApi);
    const { tabs } = tabRunning(clientOn(api.fetch), () => undefined);
    const proxy = createNakaProxy(tabs, fakeTimer());
    expect(await proxy.addToPlaylist(5)).toBeUndefined();
    expect(await proxy.removeFromPlaylist(6)).toBeUndefined();
    expect(api.calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "POST https://naka.cx/api/v1/playlist",
      "DELETE https://naka.cx/api/v1/playlist/6",
    ]);
  });

  it("account returns String(user.id)", async () => {
    const { proxy } = both();
    expect(await proxy.account()).toBe("42");
  });

  it("account is undefined when the tab has none", async () => {
    const { tabs } = tabRunning(
      clientOn(fakeApi(standardApi).fetch),
      () => undefined,
    );
    expect(await createNakaProxy(tabs, fakeTimer()).account()).toBeUndefined();
  });
});

describe("tab selection", () => {
  it("queries the Naka origin and uses the first tab", async () => {
    const queried: string[] = [];
    const port = portAnswering(() => ok([]), [31, 32]);
    const spy: TabsPort = {
      query: async (url) => {
        queried.push(url);
        return port.query(url);
      },
      send: port.send,
    };
    await createNakaProxy(spy, fakeTimer()).playlistIds();
    expect(queried).toEqual(["https://naka.cx/*"]);
    expect(port.sent.map((s) => s.tabId)).toEqual([31]);
  });

  it("rejects with JobRejected(no-naka-tab) when there is no tab", async () => {
    const port = portAnswering(() => ok([]), []);
    const error = await failure(
      createNakaProxy(port, fakeTimer()).playlistIds(),
    );
    expect(error).toBeInstanceOf(JobRejected);
    expect((error as JobRejected).code).toBe("no-naka-tab");
    expect(port.sent).toHaveLength(0);
  });

  it("applies to every call, the account included", async () => {
    const port = portAnswering(() => ok(), []);
    const proxy = createNakaProxy(port, fakeTimer());
    for (const run of [
      () => proxy.addToPlaylist(1),
      () => proxy.removeFromPlaylist(1),
      () => proxy.search("a"),
      () => proxy.contentById(1),
      () => proxy.account(),
    ]) {
      expect(((await failure(run())) as JobRejected).code).toBe("no-naka-tab");
    }
  });

  it("maps a failing tab query to unavailable", async () => {
    const port: TabsPort = {
      query: async () => {
        throw new Error(MARKER);
      },
      send: async () => ok(),
    };
    const error = await failure(
      createNakaProxy(port, fakeTimer()).playlistIds(),
    );
    expect(error).toBeInstanceOf(NakaUnavailableError);
    expect(strings(error).join("|")).not.toContain(MARKER);
  });

  // Ruling 17: a closed tab, or a content script gone after an extension reload.
  it("maps a failing send to JobRejected(no-naka-tab), without its text", async () => {
    const port: TabsPort = {
      query: async () => [{ id: 1 }],
      send: async () => {
        throw new Error(MARKER);
      },
    };
    const error = await failure(
      createNakaProxy(port, fakeTimer()).playlistIds(),
    );
    expect(error).toBeInstanceOf(JobRejected);
    expect((error as JobRejected).code).toBe("no-naka-tab");
    expect(strings(error).join("|")).not.toContain(MARKER);
  });
});

// Ruling 20: a tab with no content script (opened before the install, or after an extension reload)
// rejects its send. A proxy is one job's: it pins the first tab that answers, for every later call.
describe("pinning the first tab that answers", () => {
  const DEAD = new Error(`Receiving end does not exist. ${MARKER}`);

  function tabsAnswering(
    answer: (tabId: number, msg: unknown) => unknown,
    ids: () => number[],
  ) {
    const log: string[] = [];
    const port: TabsPort = {
      query: async () => {
        log.push("query");
        return ids().map((id) => ({ id }));
      },
      send: async (tabId, msg) => {
        log.push(`send:${tabId}`);
        const reply = answer(tabId, msg);
        if (reply instanceof Error) throw reply;
        return reply;
      },
    };
    return { port, log };
  }

  it("tries the tabs in their query order and pins the first that answers", async () => {
    const t = tabsAnswering(
      (id) => (id === 31 ? DEAD : ok([id])),
      () => [31, 32, 33],
    );
    const proxy = createNakaProxy(t.port, fakeTimer());
    expect(await proxy.playlistIds()).toEqual([32]);
    expect(await proxy.playlistIds()).toEqual([32]);
    expect(t.log).toEqual(["query", "send:31", "send:32", "send:32"]);
  });

  it("pins a tab whose reply is an error code", async () => {
    const t = tabsAnswering(
      (id) => (id === 31 ? { ok: false, error: "unavailable" } : ok([id])),
      () => [31, 32],
    );
    const proxy = createNakaProxy(t.port, fakeTimer());
    expect(await failure(proxy.playlistIds())).toBeInstanceOf(
      NakaUnavailableError,
    );
    await failure(proxy.playlistIds());
    expect(t.log).toEqual(["query", "send:31", "send:31"]);
  });

  it("no tab answering: no-naka-tab, the loss heard once, and no later call reaches the tabs", async () => {
    const t = tabsAnswering(
      () => DEAD,
      () => [31, 32],
    );
    const lost: unknown[] = [];
    const proxy = createNakaProxy(t.port, fakeTimer(), (e) => lost.push(e));
    const first = await failure(proxy.playlistIds());
    expect(first).toBeInstanceOf(JobRejected);
    expect((first as JobRejected).code).toBe("no-naka-tab");
    expect(strings(first).join("|")).not.toContain(MARKER);
    const later = await failure(proxy.account());
    expect((later as JobRejected).code).toBe("no-naka-tab");
    expect(t.log).toEqual(["query", "send:31", "send:32"]);
    expect(lost).toHaveLength(1);
    expect((lost[0] as JobRejected).code).toBe("no-naka-tab");
  });

  it("a pinned tab whose send rejects while it is still listed changed page: no other tab is tried", async () => {
    let dead = false;
    const t = tabsAnswering(
      (id) => (dead && id === 31 ? DEAD : ok([id])),
      () => [31, 32],
    );
    const lost: unknown[] = [];
    const proxy = createNakaProxy(t.port, fakeTimer(), (e) => lost.push(e));
    await proxy.playlistIds();
    dead = true;
    expect(((await failure(proxy.playlistIds())) as JobRejected).code).toBe(
      "naka-tab-changed",
    );
    expect(((await failure(proxy.playlistIds())) as JobRejected).code).toBe(
      "naka-tab-changed",
    );
    expect(t.log).toEqual(["query", "send:31", "send:31", "query"]);
    expect(lost).toHaveLength(1);
    expect((lost[0] as JobRejected).code).toBe("naka-tab-changed");
  });

  it("a pinned tab that left the query is a lost tab: no-naka-tab", async () => {
    let dead = false;
    let listed = [31];
    const t = tabsAnswering(
      (id) => (dead && id === 31 ? DEAD : ok([id])),
      () => listed,
    );
    const lost: unknown[] = [];
    const proxy = createNakaProxy(t.port, fakeTimer(), (e) => lost.push(e));
    await proxy.playlistIds();
    dead = true;
    listed = [32];
    expect(((await failure(proxy.playlistIds())) as JobRejected).code).toBe(
      "no-naka-tab",
    );
    expect(t.log).toEqual(["query", "send:31", "send:31", "query"]);
    expect((lost[0] as JobRejected).code).toBe("no-naka-tab");
  });

  it("a query that throws after the loss gives no-naka-tab, without its text", async () => {
    let queries = 0;
    const port: TabsPort = {
      query: async () => {
        queries += 1;
        if (queries > 1) throw new Error(MARKER);
        return [{ id: 31 }];
      },
      send: async (_id, _msg) => {
        if (queries > 0 && sent++ > 0) throw new Error(MARKER);
        return ok([1]);
      },
    };
    let sent = 0;
    const proxy = createNakaProxy(port, fakeTimer());
    await proxy.playlistIds();
    const error = await failure(proxy.playlistIds());
    expect((error as JobRejected).code).toBe("no-naka-tab");
    expect(strings(error).join("|")).not.toContain(MARKER);
    expect(queries).toBe(2);
  });

  it("a query that never settles after the pinned tab refused still latches the loss", async () => {
    const sends: number[] = [];
    let queries = 0;
    const port: TabsPort = {
      query: () => {
        queries += 1;
        if (queries === 1) return Promise.resolve([{ id: 31 }]);
        return new Promise(() => undefined);
      },
      send: async (id) => {
        sends.push(id);
        if (sends.length > 1) throw new Error(MARKER);
        return ok([1]);
      },
    };
    const exchange = pinFirstAnswering(port);
    await exchange({ type: "naka-call", call: "playlistIds" });
    void exchange({ type: "naka-call", call: "playlistIds" }).catch(
      () => undefined,
    );
    await Promise.resolve();
    await Promise.resolve();
    const second = await failure(
      exchange({ type: "naka-call", call: "playlistIds" }),
    );
    expect((second as JobRejected).code).toBe("no-naka-tab");
    expect(sends).toEqual([31, 31]);
  });

  it("a send that rejects before any pin asks nothing more: no-naka-tab", async () => {
    const t = tabsAnswering(
      () => DEAD,
      () => [31],
    );
    const proxy = createNakaProxy(t.port, fakeTimer());
    expect(((await failure(proxy.playlistIds())) as JobRejected).code).toBe(
      "no-naka-tab",
    );
    expect(t.log).toEqual(["query", "send:31"]);
  });

  it("no tab found: no-naka-tab, and the next call looks again", async () => {
    let ids: number[] = [];
    const t = tabsAnswering(
      (id) => ok([id]),
      () => ids,
    );
    const lost: unknown[] = [];
    const proxy = createNakaProxy(t.port, fakeTimer(), (e) => lost.push(e));
    expect(((await failure(proxy.playlistIds())) as JobRejected).code).toBe(
      "no-naka-tab",
    );
    ids = [41];
    expect(await proxy.playlistIds()).toEqual([41]);
    expect(t.log).toEqual(["query", "query", "send:41"]);
    expect(lost).toEqual([]);
  });

  it("one 20 s timer covers the whole call, the tries included", async () => {
    const timer = fakeTimer();
    const port: TabsPort = {
      query: async () => [{ id: 31 }, { id: 32 }],
      send: (tabId) =>
        tabId === 31 ? Promise.reject(DEAD) : new Promise(() => {}),
    };
    const outcome = failure(createNakaProxy(port, timer).playlistIds());
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    expect(timer.delays).toEqual([20000]);
    timer.pending.get(0)?.();
    const error = await outcome;
    expect(error).toBeInstanceOf(NakaUnavailableError);
    expect(error.message).toBe("Naka tab: no answer in time");
  });
});

describe("timeout", () => {
  it("uses a 20 s timer and rejects when the tab never answers", async () => {
    const timer = fakeTimer();
    const port: TabsPort = {
      query: async () => [{ id: 1 }],
      send: () => new Promise(() => {}),
    };
    expect(NAKA_CALL_TIMEOUT_MS).toBe(20000);
    const outcome = failure(createNakaProxy(port, timer).playlistIds());
    await Promise.resolve();
    await Promise.resolve();
    expect(timer.delays).toEqual([20000]);
    timer.pending.get(0)?.();
    const error = await outcome;
    expect(error).toBeInstanceOf(NakaUnavailableError);
  });

  it("starts the timer before the tab query settles", async () => {
    const timer = fakeTimer();
    const port: TabsPort = {
      query: () => new Promise(() => {}),
      send: async () => ok(),
    };
    const outcome = failure(createNakaProxy(port, timer).search("x"));
    await Promise.resolve();
    expect(timer.delays).toEqual([20000]);
    timer.pending.get(0)?.();
    expect(await outcome).toBeInstanceOf(NakaUnavailableError);
  });

  it("clears the timer after an answer and after a failure", async () => {
    const timer = fakeTimer();
    const good = createNakaProxy(
      portAnswering(() => ok([1])),
      timer,
    );
    await good.playlistIds();
    const bad = createNakaProxy(
      portAnswering(() => ({ ok: false, error: "unavailable" })),
      timer,
    );
    await failure(bad.playlistIds());
    await Promise.resolve();
    expect(timer.cleared).toEqual([0, 1]);
    expect(timer.pending.size).toBe(0);
  });

  describe("a late settlement after the timeout", () => {
    async function timedOut(settle: (late: LateTab) => void) {
      const timer = fakeTimer();
      const late: LateTab = { resolve: () => {}, reject: () => {} };
      const port: TabsPort = {
        query: async () => [{ id: 1 }],
        send: () =>
          new Promise((resolve, reject) => {
            late.resolve = resolve;
            late.reject = reject;
          }),
      };
      const outcome = createNakaProxy(port, timer).playlistIds();
      const settled = failure(outcome);
      await Promise.resolve();
      await Promise.resolve();
      timer.pending.get(0)?.();
      const error = await settled;
      expect(error).toBeInstanceOf(NakaUnavailableError);
      expect(error.message).toBe("Naka tab: no answer in time");
      settle(late);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      // still the same settled outcome, and the timer was cleared once
      expect(await failure(outcome)).toBe(error);
      expect(timer.cleared).toEqual([0]);
    }

    it("ignores a late answer", async () => {
      await timedOut((late) => late.resolve(ok([1])));
    });

    it("ignores a late rejection", async () => {
      await timedOut((late) => late.reject(new Error(MARKER)));
    });

    it("ignores a late no-token reply", async () => {
      await timedOut((late) => late.resolve({ ok: false, error: "no-token" }));
    });
  });
});

describe("error replies", () => {
  it("session becomes JobRejected(naka-session)", async () => {
    const { proxy } = proxyAnswering(() => ({ ok: false, error: "session" }));
    for (const run of [
      () => proxy.playlistIds(),
      () => proxy.addToPlaylist(1),
      () => proxy.search("a"),
      () => proxy.contentById(1),
      () => proxy.account(),
    ]) {
      const error = await failure(run());
      expect(error).toBeInstanceOf(JobRejected);
      expect((error as JobRejected).code).toBe("naka-session");
    }
  });

  it("rate-limit becomes a 429 NakaUnavailableError, contentById included", async () => {
    const { proxy } = proxyAnswering(() => ({
      ok: false,
      error: "rate-limit",
    }));
    for (const run of [
      () => proxy.playlistIds(),
      () => proxy.removeFromPlaylist(1),
      () => proxy.contentById(1),
    ]) {
      const error = await failure(run());
      expect(error).toBeInstanceOf(NakaUnavailableError);
      expect((error as NakaUnavailableError).status).toBe(429);
    }
  });

  it("carries HTTP 401, 403 and 429 through the real tab handler", async () => {
    const expected = [
      [401, "session"],
      [403, "session"],
      [429, "rate-limit"],
    ] as const;
    for (const [status, kind] of expected) {
      const api = fakeApi(() => ({ status, body: MARKER }));
      const traffic = { sent: [] as unknown[], returned: [] as unknown[] };
      const { tabs } = tabRunning(
        clientOn(api.fetch),
        () => undefined,
        traffic,
      );
      const error = await failure(
        createNakaProxy(tabs, fakeTimer()).playlistIds(),
      );
      if (kind === "session") {
        expect((error as JobRejected).code).toBe("naka-session");
      } else {
        expect((error as NakaUnavailableError).status).toBe(429);
      }
      expect(strings([error, traffic]).join("|")).not.toContain(MARKER);
    }
  });

  it("no-token becomes JobRejected(naka-session)", async () => {
    const { proxy } = proxyAnswering(() => ({ ok: false, error: "no-token" }));
    for (const run of [
      () => proxy.playlistIds(),
      () => proxy.addToPlaylist(1),
      () => proxy.search("a"),
      () => proxy.contentById(1),
      () => proxy.account(),
    ]) {
      const error = await failure(run());
      expect(error).toBeInstanceOf(JobRejected);
      expect((error as JobRejected).code).toBe("naka-session");
    }
  });

  it("unavailable becomes NakaUnavailableError with a fixed text", async () => {
    const { proxy } = proxyAnswering(() => ({
      ok: false,
      error: "unavailable",
      message: MARKER,
    }));
    const error = await failure(proxy.playlistIds());
    expect(error).toBeInstanceOf(NakaUnavailableError);
    expect(strings(error).join("|")).not.toContain(MARKER);
  });

  it("not-found becomes a 404 NakaUnavailableError, except for contentById", async () => {
    const { proxy } = proxyAnswering(() => ({ ok: false, error: "not-found" }));
    const error = await failure(proxy.addToPlaylist(1));
    expect(error).toBeInstanceOf(NakaUnavailableError);
    expect((error as NakaUnavailableError).status).toBe(404);
    expect(await proxy.contentById(1)).toBeUndefined();
  });

  it("an unknown error code fails closed", async () => {
    const { proxy } = proxyAnswering(() => ({ ok: false, error: "weird" }));
    expect(await failure(proxy.playlistIds())).toBeInstanceOf(
      NakaUnavailableError,
    );
  });

  it("a reply that is not a reply fails closed", async () => {
    for (const bad of [undefined, null, "ok", 3, [], {}, { ok: "yes" }]) {
      const { proxy } = proxyAnswering(() => bad);
      expect(await failure(proxy.playlistIds())).toBeInstanceOf(
        NakaUnavailableError,
      );
    }
  });
});

describe("re-validation of the value", () => {
  it("drops a forged top-level field", async () => {
    const { proxy } = proxyAnswering(() => ({
      ok: true,
      value: [1, 2],
      token: MARKER,
      extra: 1,
    }));
    expect(await proxy.playlistIds()).toStrictEqual([1, 2]);
  });

  it("drops a forged field inside an item", async () => {
    const forged = { ...item(7), admin: true, token: MARKER };
    const { proxy } = proxyAnswering(() => ok(forged));
    const result = await proxy.contentById(7);
    expect(result).toStrictEqual(item(7));
    expect(Object.keys(result ?? {})).not.toContain("admin");
  });

  it("keeps a valid numberOfSeasons through the tab's reply, drops an invalid one", async () => {
    const kept = await proxyAnswering(() =>
      ok({ ...item(7), numberOfSeasons: 7 }),
    ).proxy.contentById(7);
    expect(kept?.numberOfSeasons).toBe(7);
    for (const bad of [0, -1, 1.5, "7", null]) {
      const result = await proxyAnswering(() =>
        ok({ ...item(7), numberOfSeasons: bad }),
      ).proxy.contentById(7);
      expect(result).toStrictEqual(item(7));
    }
  });

  it("drops a forged field inside search items", async () => {
    const { proxy } = proxyAnswering(() => ok([{ ...item(1), admin: true }]));
    expect(await proxy.search("a")).toStrictEqual([item(1)]);
  });

  it("keeps the optional fields and rebuilds the item", async () => {
    const full = { ...item(7), originalTitle: "O", releaseDate: "2020-01-02" };
    const { proxy } = proxyAnswering(() => ok(full));
    const result = await proxy.contentById(7);
    expect(result).toStrictEqual(full);
    expect(result).not.toBe(full);
  });

  it("playlistIds rejects a value of the wrong shape", async () => {
    for (const value of [
      undefined,
      null,
      "1,2",
      { 0: 1 },
      [0],
      [-1],
      [1.5],
      ["1"],
      [Number.MAX_SAFE_INTEGER + 1],
      [1, null],
      [1, Number.NaN],
      new Array(2),
    ]) {
      const { proxy } = proxyAnswering(() => ok(value));
      expect(await failure(proxy.playlistIds())).toBeInstanceOf(
        NakaUnavailableError,
      );
    }
  });

  it("playlistIds accepts an empty list and drops duplicates", async () => {
    expect(await proxyAnswering(() => ok([])).proxy.playlistIds()).toEqual([]);
    expect(
      await proxyAnswering(() => ok([2, 1, 2])).proxy.playlistIds(),
    ).toEqual([2, 1]);
  });

  it("search rejects a value that is not a list of valid items", async () => {
    const bad = [
      undefined,
      null,
      item(1),
      "x",
      [null],
      [{}],
      [item(1), { ...item(2), contentId: 0 }],
      [{ ...item(1), tmdbId: "5" }],
      [{ ...item(1), mediaType: "show" }],
      [{ ...item(1), title: "" }],
      [{ ...item(1), title: 5 }],
      [item(1), undefined],
      new Array(1),
    ];
    for (const value of bad) {
      const { proxy } = proxyAnswering(() => ok(value));
      expect(await failure(proxy.search("a"))).toBeInstanceOf(
        NakaUnavailableError,
      );
    }
  });

  it("search returns an empty list as is", async () => {
    expect(await proxyAnswering(() => ok([])).proxy.search("a")).toEqual([]);
  });

  it("contentById rejects a malformed item", async () => {
    for (const value of [
      null,
      "x",
      7,
      [item(7)],
      {},
      { ...item(7), contentId: "7" },
      { ...item(7), contentId: -7 },
      { ...item(7), mediaType: "anime" },
      { ...item(7), title: "" },
      { ...item(7), tmdbId: 0 },
    ]) {
      const { proxy } = proxyAnswering(() => ok(value));
      expect(await failure(proxy.contentById(7))).toBeInstanceOf(
        NakaUnavailableError,
      );
    }
  });

  it("contentById rejects an item for another content id", async () => {
    const { proxy } = proxyAnswering(() => ok(item(8)));
    expect(await failure(proxy.contentById(7))).toBeInstanceOf(
      NakaUnavailableError,
    );
  });

  it("contentById with no value is undefined", async () => {
    expect(
      await proxyAnswering(() => ok()).proxy.contentById(7),
    ).toBeUndefined();
  });

  it("availableSeasons re-validates the tab's value", async () => {
    for (const value of [
      null,
      "x",
      7,
      [],
      {},
      { seasons: [], episodeCounts: {} },
      { seasons: [1], episodeCounts: { "0": 5 } },
      { seasons: [1], episodeCounts: { "1": 1.5 } },
      { seasons: ["1"], episodeCounts: {} },
    ]) {
      const { proxy } = proxyAnswering(() => ok(value));
      expect(await failure(proxy.availableSeasons(7))).toBeInstanceOf(
        NakaUnavailableError,
      );
    }
    const good = { seasons: [1, 2], episodeCounts: { "1": 8 } };
    expect(
      await proxyAnswering(() => ok(good)).proxy.availableSeasons(7),
    ).toEqual({ seasons: [1, 2], episodeCounts: { 1: 8 } });
  });

  it("availableSeasons with no value, or not-found, is undefined", async () => {
    expect(
      await proxyAnswering(() => ok()).proxy.availableSeasons(7),
    ).toBeUndefined();
    const { proxy } = proxyAnswering(() => ({ ok: false, error: "not-found" }));
    expect(await proxy.availableSeasons(7)).toBeUndefined();
  });

  it("add and remove reject any value", async () => {
    for (const value of [[1], "x", 0, false, null, {}, item(1)]) {
      const { proxy } = proxyAnswering(() => ({ ok: true, value }));
      expect(await failure(proxy.addToPlaylist(1))).toBeInstanceOf(
        NakaUnavailableError,
      );
      expect(await failure(proxy.removeFromPlaylist(1))).toBeInstanceOf(
        NakaUnavailableError,
      );
    }
  });

  it("account accepts a canonical positive integer string only", async () => {
    expect(await proxyAnswering(() => ok("42")).proxy.account()).toBe("42");
    for (const value of [
      42,
      "",
      "0",
      "-1",
      "007",
      "4.2",
      " 42",
      "42 ",
      "a@b.c",
      MARKER,
      "9007199254740993",
      [],
      {},
      null,
      true,
    ]) {
      const { proxy } = proxyAnswering(() => ok(value));
      expect(await failure(proxy.account())).toBeInstanceOf(
        NakaUnavailableError,
      );
    }
  });
});

describe("messages sent to the tab", () => {
  it("sends the exact message of each call", async () => {
    const { port, proxy } = proxyAnswering(
      (m: { type: string; call?: string }) =>
        m.call === "playlistIds" || m.call === "search" ? ok([]) : ok(),
    );
    await proxy.playlistIds();
    await proxy.addToPlaylist(5);
    await proxy.removeFromPlaylist(6);
    await proxy.search("  titre  ");
    await proxy.contentById(7);
    await proxy.availableSeasons(7);
    await proxy.account();
    expect(port.sent.map((s) => s.msg)).toEqual([
      { type: "naka-call", call: "playlistIds" },
      { type: "naka-call", call: "add", contentId: 5 },
      { type: "naka-call", call: "remove", contentId: 6 },
      { type: "naka-call", call: "search", query: "titre" },
      { type: "naka-call", call: "contentById", contentId: 7 },
      { type: "naka-call", call: "availableSeasons", contentId: 7 },
      { type: "naka-account" },
    ]);
  });

  it("rejects a bad input before any tab lookup", async () => {
    const { port, proxy } = proxyAnswering(() => ok());
    await expect(proxy.addToPlaylist(0)).rejects.toThrow(RangeError);
    await expect(proxy.removeFromPlaylist(1.5)).rejects.toThrow(RangeError);
    await expect(proxy.contentById(-1)).rejects.toThrow(RangeError);
    await expect(proxy.availableSeasons(0)).rejects.toThrow(RangeError);
    await expect(proxy.search("   ")).rejects.toThrow(RangeError);
    expect(port.sent).toHaveLength(0);
    expect(port.queried).toEqual([]);
  });
});

describe("the Naka token never crosses the tabs port", () => {
  const storage = {
    getItem: () =>
      JSON.stringify({
        state: { token: MARKER, user: { id: 42, email: MARKER, name: MARKER } },
      }),
  };

  async function allErrors(run: (() => Promise<unknown>)[]): Promise<Error[]> {
    return Promise.all(run.map((r) => failure(r())));
  }

  it("keeps the marker out of every message, reply and result", async () => {
    const api = fakeApi(standardApi);
    const { tabs, traffic } = tabRunning(clientOn(api.fetch), () =>
      readAccount(storage),
    );
    const proxy = createNakaProxy(tabs, fakeTimer());
    const results = [
      await proxy.playlistIds(),
      await proxy.search("titre"),
      await proxy.contentById(7),
      await proxy.contentById(8),
      await proxy.addToPlaylist(5),
      await proxy.removeFromPlaylist(6),
      await proxy.account(),
    ];
    // control: the token did reach the API, from inside the tab
    expect(api.calls.length).toBeGreaterThan(0);
    for (const c of api.calls) {
      expect(JSON.stringify(c.init.headers)).toContain(MARKER);
    }
    expect(traffic.sent.length).toBe(7);
    expect(traffic.returned.length).toBe(7);
    const seen = [...traffic.sent, ...traffic.returned, ...results];
    expect(strings(seen).join("|")).not.toContain(MARKER);
  });

  it("keeps the marker out of every error, in every failure mode", async () => {
    const hostileFetch = async () => {
      throw new Error(`boom ${MARKER}`);
    };
    const modes = [
      clientOn(hostileFetch as never),
      clientOn(fakeApi(() => json({}, 401)).fetch),
      clientOn(fakeApi(() => json({}, 500)).fetch),
      clientOn(
        fakeApi((c) =>
          json(
            { contentIds: "x", data: "x" },
            c.init.method === "POST" ? 503 : 200,
          ),
        ).fetch,
      ),
      clientOn(fakeApi(standardApi).fetch, ""),
    ];
    const errors: Error[] = [];
    const traffic = { sent: [] as unknown[], returned: [] as unknown[] };
    for (const client of modes) {
      const { tabs } = tabRunning(client, () => readAccount(storage), traffic);
      const proxy = createNakaProxy(tabs, fakeTimer());
      errors.push(
        ...(await allErrors([
          () => proxy.playlistIds(),
          () => proxy.addToPlaylist(1),
          () => proxy.search("a"),
        ])),
      );
    }
    expect(errors).toHaveLength(15);
    for (const error of errors) {
      expect(Reflect.ownKeys(error).length).toBeGreaterThan(0);
      expect(strings(error).join("|")).not.toContain(MARKER);
    }
    expect(strings(traffic).join("|")).not.toContain(MARKER);
  });
});
