import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The MAIN-world entry against a fake page: what it wraps, where it posts, and what it never reads.
const calls: unknown[][] = [];
const posts: unknown[][] = [];
const storageReads: string[] = [];

const pageFetch = async (...args: unknown[]) => {
  calls.push(args);
  return { ok: true, status: 200 } as Response;
};

const page = {
  fetch: pageFetch as unknown as typeof fetch,
  postMessage: (...args: unknown[]) => {
    posts.push(args);
  },
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

  it("never reads the page's storage, where the Naka token lives", () => {
    expect(storageReads).toEqual([]);
  });
});
