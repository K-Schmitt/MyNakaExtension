import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { visitMessage } from "../src/ext/fiche-visit";

// The MAIN-world entry against a fake page: what it wraps, where it posts, and what it never reads.
const calls: unknown[][] = [];
const posts: unknown[][] = [];
const storageReads: string[] = [];

const listeners: ((ev: unknown) => void)[] = [];
const CONTENT = {
  id: 21391,
  tmdbId: 1434,
  mediaType: "tv",
  title: "Les Griffin",
};

const pageFetch = async (...args: unknown[]) => {
  calls.push(args);
  const json = async () => CONTENT;
  return { ok: true, status: 200, clone: () => ({ json }) } as Response;
};

const page = {
  fetch: pageFetch as unknown as typeof fetch,
  postMessage: (...args: unknown[]) => {
    posts.push(args);
  },
  addEventListener: (type: string, fn: (ev: unknown) => void) => {
    if (type === "message") listeners.push(fn);
  },
};
const announce = (path: string, over: object = {}) => {
  const ev = { source: page, origin: "https://naka.cx", ...over };
  for (const fn of listeners) fn({ ...ev, data: visitMessage(path) });
};

const settle = () => new Promise((resolve) => setImmediate(resolve));
const where = { href: "https://naka.cx/player?id=3&type=movie" };

beforeAll(async () => {
  vi.stubGlobal("window", page);
  vi.stubGlobal("location", where);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => {
      storageReads.push(key);
      return null;
    },
  });
  await import("../src/page/naka-main");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("MAIN-world entry", () => {
  it("replaces the page's fetch with a wrapper that calls it as it was called", async () => {
    expect(page.fetch).not.toBe(pageFetch);
    const init = { method: "POST", body: "{}" };
    await page.fetch("/api/v1/playlist", init);
    expect(calls).toEqual([["/api/v1/playlist", init]]);
    expect(calls[0]?.[1]).toBe(init);
  });

  it("posts the page event to its own window, for https://naka.cx only", async () => {
    await settle();
    expect(posts).toEqual([
      [{ channel: "mynaka/1", kind: "playlist" }, "https://naka.cx"],
    ]);
  });

  it("resolves a request against the page it is sent from", async () => {
    const before = posts.length;
    where.href = "https://naka.cx/content/movie/5";
    // The browser sends this one to /content/movie/api/v1/playlist: not the playlist API.
    await page.fetch("api/v1/playlist", { method: "POST" });
    where.href = "https://naka.cx/player?id=3&type=movie";
    await settle();
    expect(posts.slice(before)).toEqual([]);
  });

  it("posts again the title page events the tab missed when it announces that title's visit", async () => {
    await page.fetch("https://naka.cx/api/v1/browse/by-tmdb/tv/1434");
    await page.fetch("https://naka.cx/api/v1/browse/21391/season/2");
    await settle();
    const before = posts.length;
    announce("/content/tv/1434");
    expect(posts.slice(before)).toEqual([
      [
        {
          channel: "mynaka/1",
          kind: "fiche",
          contentId: 21391,
          tmdbId: 1434,
          mediaType: "tv",
          title: "Les Griffin",
        },
        "https://naka.cx",
      ],
      [
        { channel: "mynaka/1", kind: "season", contentId: 21391, season: 2 },
        "https://naka.cx",
      ],
    ]);
  });

  it("posts nothing for another title, another window or another origin", () => {
    const before = posts.length;
    announce("/content/tv/1435");
    announce("/content/movie/1434");
    announce("/content/tv/1434", { source: {} });
    announce("/content/tv/1434", { origin: "https://evil.example" });
    expect(posts.slice(before)).toEqual([]);
  });

  it("never reads the page's storage, where the Naka token lives", () => {
    expect(storageReads).toEqual([]);
  });
});
