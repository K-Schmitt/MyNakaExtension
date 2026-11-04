import { describe, expect, it } from "vitest";
import {
  createScClient,
  type Fetch,
  type ScClient,
  ScUnauthenticatedError,
  ScUnavailableError,
} from "../src/sc/sc-client";
import { createSessionReader } from "../src/sc/sc-session";
import { opensBreaker } from "../src/sw/circuit-breaker";
import { buildSyncPorts } from "../src/sw/sync-ports";
import { strings } from "./naka-bridge-fakes";
import { countingLimiter, fakeNaka, memoryStore } from "./sw-fakes";

// A rate limit on the home page (the session read) must stay a rate limit, so that the breaker opens
// (M2): every other failure of the read keeps its one fixed text.
const TOKEN = "T0K3NFAKE0123456789abcdef";
const HOME = "https://www.senscritique.com/";

const SESSION_CALLS: [string, (client: ScClient) => Promise<unknown>][] = [
  ["wish", (c) => c.wish(5)],
  ["productState", (c) => c.productState(5)],
  ["readWishlist", (c) => c.readWishlist("movie")],
  ["search", (c) => c.search("Titre", "movie")],
];

function homeAnswering(status: number) {
  const calls: string[] = [];
  const fetch: Fetch = async (url) => {
    calls.push(url);
    return {
      ok: status === 200,
      status,
      text: async () => `<html>${TOKEN}</html>`,
    };
  };
  const client = createScClient({
    fetch,
    getSession: createSessionReader(fetch),
  });
  return { calls, client };
}

function readerThrowing(thrown: () => unknown) {
  const calls: string[] = [];
  const fetch: Fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const getSession = async () => {
    throw thrown();
  };
  return { calls, client: createScClient({ fetch, getSession }) };
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof Error)) throw new Error("expected an Error");
  return error;
}

describe("a home page that SensCritique rate-limits", () => {
  it.each(SESSION_CALLS)(
    "%s rejects with the fixed 429 session error, which opens the breaker",
    async (_name, run) => {
      const { client, calls } = homeAnswering(429);
      const error = await rejection(run(client));
      expect(error).toBeInstanceOf(ScUnavailableError);
      expect(error).not.toBeInstanceOf(ScUnauthenticatedError);
      expect(error.message).toBe("SensCritique session: HTTP 429");
      expect(error.cause).toBeUndefined();
      expect(strings(error).join(" ")).not.toContain(TOKEN);
      expect(opensBreaker(error)).toBe(true);
      expect(calls).toEqual([HOME]);
    },
  );

  it.each([403, 421, 500, 503])(
    "a home page answering %s still cannot be read, and opens no breaker",
    async (status) => {
      const { client } = homeAnswering(status);
      const error = await rejection(client.search("Titre", "movie"));
      expect(error.message).toBe("SensCritique session: could not be read");
      expect(opensBreaker(error)).toBe(false);
    },
  );

  it.each([
    ["a plain Error that says HTTP 429", () => new Error(`HTTP 429 ${TOKEN}`)],
    ["a string that says HTTP 429", () => `HTTP 429 ${TOKEN}`],
    [
      "an error whose prototype cannot be read",
      () =>
        new Proxy(
          {},
          {
            getPrototypeOf() {
              throw new Error(TOKEN);
            },
          },
        ),
    ],
  ])("%s from the reader still cannot be read", async (_name, thrown) => {
    const { client, calls } = readerThrowing(thrown);
    const error = await rejection(client.productState(5));
    expect(error).toBeInstanceOf(ScUnavailableError);
    expect(error.message).toBe("SensCritique session: could not be read");
    expect(strings(error).join(" ")).not.toContain(TOKEN);
    expect(calls).toEqual([]);
  });

  it("a 429 from the reader is rebuilt from fixed text: none of its fields, cause or text pass", async () => {
    const leaky = Object.assign(
      new ScUnavailableError(`SensCritique session: HTTP 429 ${TOKEN}`),
      { body: TOKEN },
    );
    leaky.cause = TOKEN;
    const { client } = readerThrowing(() => leaky);
    const error = await rejection(client.productState(5));
    expect(error).not.toBe(leaky);
    expect(error.message).toBe("SensCritique session: HTTP 429");
    expect(error.cause).toBeUndefined();
    expect(strings(error).join(" ")).not.toContain(TOKEN);
  });

  it("opens the port's breaker: its later calls in the job make no request", async () => {
    const { client, calls } = homeAnswering(429);
    const { store } = memoryStore();
    const { ports } = buildSyncPorts({
      naka: fakeNaka().client,
      sc: client,
      limiters: {
        naka: countingLimiter([], "n"),
        sc: countingLimiter([], "s"),
      },
      store,
      mode: "live",
    });
    for (let i = 0; i < 3; i += 1) {
      await rejection(ports.scWishlistIds());
      await rejection(ports.searchSc("Titre"));
      await rejection(ports.addToSc(5));
    }
    expect(calls).toEqual([HOME, HOME, HOME]);
  });
});
