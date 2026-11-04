import { describe, expect, it } from "vitest";
import {
  createScClient,
  type Fetch,
  type ScClient,
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-client";
import { ScTimeoutError } from "../src/sc/sc-errors";
import { createSessionReader } from "../src/sc/sc-session";
import { opensBreaker } from "../src/sw/circuit-breaker";
import { buildFinishPorts } from "../src/sw/finish-ports";
import type { Timer } from "../src/sw/naka-proxy";
import { buildSyncPorts } from "../src/sw/sync-ports";
import { withRequestTimeout } from "../src/sw/timed-fetch";
import { strings } from "./naka-bridge-fakes";
import { countingLimiter, fakeNaka, memoryStore } from "./sw-fakes";

// K4: a SensCritique request the worker's 30 s timer aborted fails with the fixed text
// "SensCritique <label>: timeout", and opens the port's breaker like a 429.
const TOKEN = "T0K3NFAKE0123456789abcdef";
const HOME = "https://www.senscritique.com/";
const APOLLO = "https://apollo.senscritique.com/";
const SEASON = "https://www.senscritique.com/serie/x/5/S1";

const HOME_PAGE = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
  {
    props: {
      pageProps: { cookies: { SC_AUTH: TOKEN }, meInfos: { username: "o" } },
    },
  },
)}</script></html>`;

type Init = Parameters<Fetch>[1];

// What the fetch rejects with when its signal aborts, made to carry the token and the request.
function leakyAbort(init: Init): Error {
  const error = new Error(`${TOKEN} ${JSON.stringify(init)}`, { cause: TOKEN });
  return Object.assign(error, { init, body: TOKEN });
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

// A worker fetch (the real 30 s wrapper) over a site where `stuck` never answers: its requests hang
// until their timer fires. Every other URL answers 200 with the logged-in home page.
function stalled(stuck: string) {
  const armed: (() => void)[] = [];
  const timer: Timer = {
    set: (fn) => {
      armed.push(fn);
      return armed.length;
    },
    clear: () => undefined,
  };
  const requests: string[] = [];
  const thrown: Error[] = [];
  const raw: Fetch = async (url, init) => {
    requests.push(url);
    if (url !== stuck) {
      return { ok: true, status: 200, text: async () => HOME_PAGE };
    }
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = leakyAbort(init);
        thrown.push(error);
        reject(error);
      });
    });
  };
  const fetch = withRequestTimeout(raw, timer);
  const client = createScClient({
    fetch,
    getSession: createSessionReader(fetch),
  });
  // Fires every armed timer once the call is waiting, as 30 s would, and gives the call's rejection.
  const timeOut = async <R>(call: Promise<R>): Promise<Error> => {
    const outcome = call.then(
      () => undefined,
      (e: unknown) => e,
    );
    await settle();
    for (const fn of armed.splice(0)) fn();
    const error = await outcome;
    if (!(error instanceof Error)) throw new Error("expected an Error");
    return error;
  };
  return { client, requests, thrown, timeOut };
}

function expectTimeout(error: Error, label: string): void {
  expect(error).toBeInstanceOf(ScTimeoutError);
  expect(error).toBeInstanceOf(ScUnavailableError);
  expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
  expect(error.message).toBe(`SensCritique ${label}: timeout`);
  expect(error.cause).toBeUndefined();
  expect(strings(error).join(" ")).not.toContain(TOKEN);
  expect(opensBreaker(error)).toBe(true);
}

const APOLLO_CALLS: [string, (c: ScClient) => Promise<unknown>][] = [
  ["ProductWish", (c) => c.wish(5)],
  ["ProductUnwish", (c) => c.unwish(5)],
  ["ProductDone", (c) => c.markDone(5, "2026-11-04")],
  ["ProductCurrentUserInfos", (c) => c.productState(5)],
  ["UserCollection", (c) => c.readWishlist("movie")],
];

describe("a SensCritique request its timer aborted", () => {
  it("the scan sees the token in what the fetch threw (control)", async () => {
    const s = stalled(APOLLO);
    await s.timeOut(s.client.wish(5));
    expect(s.thrown).toHaveLength(1);
    expect(strings(s.thrown[0]).join(" ")).toContain(TOKEN);
  });

  it.each(APOLLO_CALLS)(
    "on Apollo fails as the fixed '%s: timeout', which opens the breaker and leaks nothing",
    async (label, run) => {
      const s = stalled(APOLLO);
      expectTimeout(await s.timeOut(run(s.client)), label);
      expect(s.requests).toEqual([HOME, APOLLO]);
    },
  );

  it.each(APOLLO_CALLS)(
    "on the home page fails %s as the fixed 'session: timeout'",
    async (_label, run) => {
      const s = stalled(HOME);
      expectTimeout(await s.timeOut(run(s.client)), "session");
      expect(s.requests).toEqual([HOME]);
    },
  );

  it("on Apollo fails a search as the fixed 'SearchProductExplorer: timeout', with no home-page read", async () => {
    const s = stalled(APOLLO);
    const error = await s.timeOut(s.client.search("Titre", "movie"));
    expectTimeout(error, "SearchProductExplorer");
    expect(s.requests).toEqual([APOLLO]);
  });

  it("on the season page fails as the fixed 'season page: timeout'", async () => {
    const s = stalled(SEASON);
    expectTimeout(await s.timeOut(s.client.seasonInfo(5, 1)), "season page");
    expect(s.requests).toEqual([SEASON]);
  });

  it("a timeout from the session reader is rebuilt from fixed text: none of its fields pass", async () => {
    const leaky = Object.assign(new ScTimeoutError(TOKEN), { body: TOKEN });
    leaky.cause = TOKEN;
    const fetch: Fetch = async () => {
      throw new Error("no request expected");
    };
    const client = createScClient({
      fetch,
      getSession: async () => {
        throw leaky;
      },
    });
    const error = await client.productState(5).then(
      () => new Error("expected a rejection"),
      (e: Error) => e,
    );
    expect(error).not.toBe(leaky);
    expectTimeout(error, "session");
  });
});

describe("a timed-out request opens its port's breaker", () => {
  const limiters = {
    naka: countingLimiter([], "n"),
    sc: countingLimiter([], "s"),
  };

  // The search reads no session (Ruling 20): the home page stalls the ports that read one.
  it.each([
    [APOLLO, "searchSc"],
    [HOME, "addToSc"],
  ] as const)(
    "a sync port timed out on %s (%s) makes no further request in the job",
    async (stuck, port) => {
      const s = stalled(stuck);
      const { store } = memoryStore();
      const { ports } = buildSyncPorts({
        naka: fakeNaka().client,
        sc: s.client,
        limiters,
        store,
        mode: "live",
      });
      const call = (n: number): Promise<unknown> =>
        port === "searchSc" ? ports.searchSc(`Titre ${n}`) : ports.addToSc(n);
      const first = await s.timeOut(call(5));
      const later = await s.timeOut(call(6));
      expect(later).toBe(first);
      expect(s.requests.filter((url) => url === stuck)).toHaveLength(1);
      expect(s.thrown).toHaveLength(1);
    },
  );

  it("a finish port timed out makes no further request in the job", async () => {
    const s = stalled(APOLLO);
    const { store } = memoryStore();
    const ports = buildFinishPorts({
      sc: s.client,
      limiters,
      store,
      today: () => "2026-11-04",
    });
    const first = await s.timeOut(ports.productState(5));
    const later = await s.timeOut(ports.productState(6));
    expect(later).toBe(first);
    expect(s.requests).toEqual([HOME, APOLLO]);
  });
});
