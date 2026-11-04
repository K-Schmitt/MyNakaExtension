import { describe, expect, it } from "vitest";
import { PAGE_CHANNEL, type PageEvent } from "../src/ext/messages";
import { wrapFetch } from "../src/page/fetch-wrapper";

const PAGE = "https://naka.cx/player?id=3&type=movie";
const settle = () => new Promise((resolve) => setImmediate(resolve));

type Call = { self: unknown; args: unknown[] };

function page(answer: () => Promise<Response> = async () => ok()) {
  const calls: Call[] = [];
  const returned: Promise<Response>[] = [];
  const original = function (this: unknown, ...args: unknown[]) {
    calls.push({ self: this, args });
    const response = answer();
    returned.push(response);
    return response;
  } as typeof fetch;
  const posted: PageEvent[] = [];
  const wrapped = wrapFetch(
    original,
    (event) => posted.push(event),
    () => PAGE,
  );
  return { calls, returned, posted, wrapped };
}

function ok(status = 200): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

const watchedBody = JSON.stringify({
  contentId: 7,
  seasonNumber: 1,
  episodeNumber: 2,
  watched: true,
});

describe("the page's fetch, wrapped", () => {
  it("returns the very promise the page's fetch returned", async () => {
    const p = page();
    const result = p.wrapped("/api/v1/playlist", { method: "POST" });
    expect(result).toBe(p.returned[0]);
    await result;
  });

  it("passes the page's arguments and receiver untouched", async () => {
    const p = page();
    const init = {
      method: "POST",
      body: "{}",
      headers: { authorization: "Bearer x" },
    };
    const receiver = { fetch: p.wrapped };
    await receiver.fetch("/api/v1/playlist", init);
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]?.self).toBe(receiver);
    expect(p.calls[0]?.args).toHaveLength(2);
    expect(p.calls[0]?.args[0]).toBe("/api/v1/playlist");
    expect(p.calls[0]?.args[1]).toBe(init);
    expect(init).toEqual({
      method: "POST",
      body: "{}",
      headers: { authorization: "Bearer x" },
    });
  });

  it("a Ma liste change posts a playlist event once the answer is ok", async () => {
    const p = page();
    const result = p.wrapped("https://naka.cx/api/v1/playlist", {
      method: "POST",
    });
    expect(p.posted).toEqual([]);
    await result;
    await settle();
    expect(p.posted).toEqual([{ channel: PAGE_CHANNEL, kind: "playlist" }]);
  });

  it("a relative URL is resolved against the page", async () => {
    const p = page();
    await p.wrapped("/api/v1/playlist/12", { method: "DELETE" });
    await settle();
    expect(p.posted).toEqual([{ channel: PAGE_CHANNEL, kind: "playlist" }]);
  });

  it("an explicit vu posts the watched ids", async () => {
    const p = page();
    await p.wrapped(new URL("https://naka.cx/api/v1/history/watched"), {
      method: "PUT",
      body: watchedBody,
    });
    await settle();
    expect(p.posted).toEqual([
      {
        channel: PAGE_CHANNEL,
        kind: "watched",
        contentId: 7,
        season: 1,
        episode: 2,
      },
    ]);
  });

  it.each([400, 401, 500])(
    "a vu the server refused (%s) posts nothing",
    async (status) => {
      const p = page(async () => ok(status));
      await p.wrapped("/api/v1/history/watched", {
        method: "PUT",
        body: watchedBody,
      });
      await settle();
      expect(p.posted).toEqual([]);
    },
  );

  it("a fetch that fails posts nothing, and the page sees the same failure", async () => {
    const failure = new TypeError("Failed to fetch");
    const p = page(async () => {
      throw failure;
    });
    await expect(
      p.wrapped("/api/v1/playlist", { method: "POST" }),
    ).rejects.toBe(failure);
    await settle();
    expect(p.posted).toEqual([]);
  });

  it("a fetch that throws at once throws the same error to the page", () => {
    const failure = new TypeError("Illegal invocation");
    const original = (() => {
      throw failure;
    }) as unknown as typeof fetch;
    const wrapped = wrapFetch(
      original,
      () => undefined,
      () => PAGE,
    );
    expect(() => wrapped("/api/v1/playlist", { method: "POST" })).toThrow(
      failure,
    );
  });

  it.each([
    ["another route", "/api/v1/history", "POST"],
    ["a read of the list", "/api/v1/playlist/ids", "GET"],
    ["another site", "https://cdn.naka.cx/api/v1/playlist", "POST"],
    ["a look-alike site", "https://naka.cx.evil.com/api/v1/playlist", "POST"],
  ])("%s posts nothing", async (_name, url, method) => {
    const p = page();
    await p.wrapped(url, { method });
    await settle();
    expect(p.posted).toEqual([]);
  });

  it("the posted event holds the ids only: never a header or the rest of a body", async () => {
    const TOKEN = "NAKA-TOKEN-MARKER-5e1f";
    const p = page();
    const headers = { authorization: `Bearer ${TOKEN}`, "x-extra": TOKEN };
    await p.wrapped("/api/v1/playlist", {
      method: "POST",
      headers,
      body: `{"t":"${TOKEN}"}`,
    });
    await p.wrapped("/api/v1/history/watched", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        contentId: 7,
        watched: true,
        token: TOKEN,
        user: { email: "e@x" },
      }),
    });
    await settle();
    expect(p.posted).toEqual([
      { channel: PAGE_CHANNEL, kind: "playlist" },
      { channel: PAGE_CHANNEL, kind: "watched", contentId: 7 },
    ]);
    expect(JSON.stringify(p.posted)).not.toContain(TOKEN);
  });

  it("a fetch without init is a GET, and posts nothing", async () => {
    const p = page();
    await p.wrapped("/api/v1/playlist");
    await p.wrapped("/api/v1/playlist", {});
    await settle();
    expect(p.posted).toEqual([]);
  });

  it("a Request is read for its URL and method, never for its body", async () => {
    const p = page();
    let bodyRead = false;
    const request = {
      url: "https://naka.cx/api/v1/playlist",
      method: "POST",
      get body() {
        bodyRead = true;
        return null;
      },
    } as unknown as Request;
    await p.wrapped(request);
    await settle();
    expect(p.posted).toEqual([{ channel: PAGE_CHANNEL, kind: "playlist" }]);
    expect(bodyRead).toBe(false);
    expect(p.calls[0]?.args[0]).toBe(request);
  });

  it("an init the wrapper cannot read changes nothing for the page", async () => {
    const p = page();
    const init = {
      get method(): string {
        throw new Error("hostile getter");
      },
    } as RequestInit;
    await expect(p.wrapped("/api/v1/playlist", init)).resolves.toBeDefined();
    await settle();
    expect(p.calls[0]?.args[1]).toBe(init);
    expect(p.posted).toEqual([]);
  });

  it("a post that throws is swallowed", async () => {
    const original = (async () => ok()) as unknown as typeof fetch;
    const wrapped = wrapFetch(
      original,
      () => {
        throw new Error("postMessage failed");
      },
      () => PAGE,
    );
    await wrapped("/api/v1/playlist", { method: "POST" });
    await settle();
  });

  it("a page URL that cannot be read posts nothing and lets the fetch go", async () => {
    const original = (async () => ok()) as unknown as typeof fetch;
    const posted: PageEvent[] = [];
    const wrapped = wrapFetch(
      original,
      (e) => posted.push(e),
      () => {
        throw new Error("no location");
      },
    );
    await wrapped("/api/v1/playlist", { method: "POST" });
    await settle();
    expect(posted).toEqual([]);
  });
});
