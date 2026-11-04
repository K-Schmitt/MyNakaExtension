import { describe, expect, it } from "vitest";
import type { Fetch } from "../src/sc/sc-client";
import { ScTimeoutError, ScUnavailableError } from "../src/sc/sc-errors";
import type { Timer } from "../src/sw/naka-proxy";
import {
  SC_REQUEST_TIMEOUT_MS,
  withRequestTimeout,
} from "../src/sw/timed-fetch";
import { strings } from "./naka-bridge-fakes";

type Init = Parameters<Fetch>[1];

function clock() {
  const armed: { fn: () => void; ms: number }[] = [];
  const timer: Timer = {
    set: (fn, ms) => {
      armed.push({ fn, ms });
      return armed.length;
    },
    clear: () => {
      throw new Error("the request timeout is never cleared");
    },
  };
  const fire = () => {
    for (const { fn } of armed.splice(0)) fn();
  };
  return { timer, armed, fire };
}

function recording() {
  const seen: { url: string; init: Init }[] = [];
  const fetch: Fetch = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 200, text: async () => "" };
  };
  return { seen, fetch };
}

const INIT: Init = {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "T" },
  body: "{}",
  credentials: "omit",
  redirect: "error",
};

describe("every worker request is bounded", () => {
  it("keeps every field of the request and adds a signal", async () => {
    const c = clock();
    const r = recording();
    await withRequestTimeout(r.fetch, c.timer)(
      "https://apollo.senscritique.com/",
      INIT,
    );
    expect(r.seen).toHaveLength(1);
    const { signal, ...rest } = r.seen[0]?.init ?? ({} as Init);
    expect(rest).toEqual(INIT);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(r.seen[0]?.url).toBe("https://apollo.senscritique.com/");
  });

  it("arms one 30 s timer per request, which aborts it then and not before", async () => {
    const c = clock();
    const r = recording();
    const fetch = withRequestTimeout(r.fetch, c.timer);
    await fetch("https://www.senscritique.com/", INIT);
    await fetch("https://www.senscritique.com/", INIT);
    expect(c.armed.map((a) => a.ms)).toEqual([
      SC_REQUEST_TIMEOUT_MS,
      SC_REQUEST_TIMEOUT_MS,
    ]);
    expect(SC_REQUEST_TIMEOUT_MS).toBe(30_000);
    const signals = r.seen.map((s) => s.init.signal);
    expect(signals.map((s) => s?.aborted)).toEqual([false, false]);
    c.fire();
    expect(signals.map((s) => s?.aborted)).toEqual([true, true]);
  });

  it("covers the body read: the timer stays armed once the headers arrived", async () => {
    const c = clock();
    const fetch: Fetch = async (_url, init) => ({
      ok: true,
      status: 200,
      text: () => hangUntilAborted(init),
    });
    const response = await withRequestTimeout(fetch, c.timer)(
      "https://x/",
      INIT,
    );
    const body = response.text();
    c.fire();
    await expectTimeout(body);
  });
});

// What a real fetch rejects with when its signal aborts, made to carry the request: the token in it
// must not reach the timeout error.
function leakyAbort(init: Init): Error {
  const error = new Error(`aborted ${JSON.stringify(init)}`, { cause: init });
  return Object.assign(error, { init });
}

function hangUntilAborted(init: Init): Promise<never> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(leakyAbort(init)));
  });
}

async function expectTimeout(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ScTimeoutError);
  expect(error).toBeInstanceOf(ScUnavailableError);
  expect((error as Error).message).toBe("SensCritique request: timeout");
  expect((error as Error).cause).toBeUndefined();
  expect(strings(error).join(" ")).not.toContain("T0K3N");
}

describe("a request its timer aborted (K4)", () => {
  const TOKEN_INIT: Init = { ...INIT, headers: { authorization: "T0K3N" } };

  it("the scan sees the token in what the fetch threw (control)", () => {
    expect(strings(leakyAbort(TOKEN_INIT)).join(" ")).toContain("T0K3N");
  });

  it("rejects with the fixed timeout error, dropping what the fetch threw", async () => {
    const c = clock();
    const fetch: Fetch = (_url, init) => hangUntilAborted(init);
    const request = withRequestTimeout(fetch, c.timer)(
      "https://x/",
      TOKEN_INIT,
    );
    c.fire();
    await expectTimeout(request);
  });

  it("a body read it aborted rejects with the same fixed error", async () => {
    const c = clock();
    const fetch: Fetch = async (_url, init) => ({
      ok: true,
      status: 200,
      text: () => hangUntilAborted(init),
    });
    const response = await withRequestTimeout(fetch, c.timer)(
      "https://x/",
      TOKEN_INIT,
    );
    const body = response.text();
    c.fire();
    await expectTimeout(body);
  });

  it("a request that fails before its timer fires keeps its own error", async () => {
    const c = clock();
    const own = new TypeError("Failed to fetch");
    const fetch: Fetch = async () => {
      throw own;
    };
    const request = withRequestTimeout(fetch, c.timer)("https://x/", INIT);
    await expect(request).rejects.toBe(own);
    const body: Fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => {
        throw own;
      },
    });
    const response = await withRequestTimeout(body, c.timer)(
      "https://x/",
      INIT,
    );
    await expect(response.text()).rejects.toBe(own);
  });

  it("an answer read before the timer fires is kept, status and body", async () => {
    const c = clock();
    const fetch: Fetch = async () => ({
      ok: false,
      status: 429,
      text: async () => "slow down",
    });
    const response = await withRequestTimeout(fetch, c.timer)(
      "https://x/",
      INIT,
    );
    expect([response.ok, response.status]).toEqual([false, 429]);
    expect(await response.text()).toBe("slow down");
    c.fire();
  });
});
