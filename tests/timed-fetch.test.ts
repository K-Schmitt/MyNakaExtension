import { describe, expect, it } from "vitest";
import type { Fetch } from "../src/sc/sc-client";
import type { Timer } from "../src/sw/naka-proxy";
import {
  SC_REQUEST_TIMEOUT_MS,
  withRequestTimeout,
} from "../src/sw/timed-fetch";

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
    let readBody: () => Promise<string> = async () => "";
    const fetch: Fetch = async (_url, init) => ({
      ok: true,
      status: 200,
      text: () => {
        readBody = () =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          );
        return readBody();
      },
    });
    const response = await withRequestTimeout(fetch, c.timer)(
      "https://x/",
      INIT,
    );
    const body = response.text();
    c.fire();
    await expect(body).rejects.toThrow("aborted");
  });
});
