import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { strings } from "./naka-bridge-fakes";

// The isolated-world entry against a fake Naka page and a fake `chrome`: what it binds, and where the
// page's token goes.
const EXT = "abcdefghijklmnopabcdefghijklmnop";
const TOKEN = "NAKA-TOKEN-MARKER-5e1f";
const EMAIL = "owner@example.test";
const PLAYER = "https://naka.cx/player?id=3&type=movie";

type Listener = (
  msg: unknown,
  sender: object,
  respond: (answer: unknown) => void,
) => boolean;
type PageListener = (ev: {
  source: unknown;
  origin: string;
  data: unknown;
}) => void;

const runtimeListeners: Listener[] = [];
const toWorker: unknown[] = [];
const intervals: { ms: number; fn: () => void }[] = [];
const pageListeners: { type: string; fn: PageListener }[] = [];
const documentListeners: { type: string; fn: unknown; capture: boolean }[] = [];
const requests: { url: string; init: RequestInit }[] = [];

const page = {
  addEventListener: (type: string, fn: PageListener) => {
    pageListeners.push({ type, fn });
  },
};
const player = {
  video: null as null | {
    currentTime: number;
    duration: number;
    currentSrc: string;
  },
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: {
      id: EXT,
      onMessage: { addListener: (fn: Listener) => runtimeListeners.push(fn) },
      // The worst Chrome does to a content script: a context gone at load, a worker that never answers.
      sendMessage: (msg: unknown) => {
        toWorker.push(msg);
        if (toWorker.length === 1)
          throw new Error("Extension context invalidated.");
        return Promise.reject(new Error("Receiving end does not exist."));
      },
    },
  });
  vi.stubGlobal("window", page);
  vi.stubGlobal("location", { href: PLAYER });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "nakastream-auth"
        ? JSON.stringify({
            state: { token: TOKEN, user: { id: 77, email: EMAIL } },
          })
        : null,
  });
  vi.stubGlobal("document", {
    addEventListener: (type: string, fn: unknown, capture: boolean) => {
      documentListeners.push({ type, fn, capture });
    },
    querySelector: (selector: string) =>
      selector === "video" ? player.video : null,
  });
  vi.stubGlobal("setInterval", (fn: () => void, ms: number) => {
    intervals.push({ ms, fn });
    return intervals.length;
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ contentIds: [1, 2], limit: 500 }),
    };
  });
  await import("../src/content/naka-isolated");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function ask(msg: unknown, sender: object = { id: EXT }) {
  const answers: unknown[] = [];
  const listener = runtimeListeners[0] as Listener;
  const async = listener(msg, sender, (answer) => answers.push(answer));
  return { answers, async };
}

describe("isolated-world entry", () => {
  it("says naka-ready once, at load", () => {
    expect(toWorker).toEqual([{ type: "naka-ready" }]);
  });

  it("binds one runtime listener, one page listener, the URL poll and the sampler", () => {
    expect(runtimeListeners).toHaveLength(1);
    expect(pageListeners.map((l) => l.type)).toEqual(["message"]);
    expect(intervals.map((i) => i.ms).sort()).toEqual([1000, 5000]);
  });

  it("listens to the video's pause and play on the document, in capture", () => {
    expect(documentListeners.map((l) => [l.type, l.capture])).toEqual([
      ["pause", true],
      ["play", true],
    ]);
  });

  it("runs the worker's calls with the page's token, sent only to the Naka API", async () => {
    const call = ask({ type: "naka-call", call: "playlistIds" });
    expect(call.async).toBe(true);
    await settle();
    expect(call.answers).toEqual([{ ok: true, value: [1, 2] }]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://naka.cx/api/v1/playlist/ids");
    const headers = requests[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("answers the account id, never the e-mail", async () => {
    const call = ask({ type: "naka-account" });
    await settle();
    expect(call.answers).toEqual([{ ok: true, value: "77" }]);
  });

  it("ignores a call from another extension", async () => {
    const call = ask(
      { type: "naka-call", call: "playlistIds" },
      { id: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" },
    );
    expect(call.async).toBe(false);
    await settle();
    expect(call.answers).toEqual([]);
  });

  it("samples the page's video for the player URL", async () => {
    const before = toWorker.length;
    player.video = { currentTime: 5990, duration: 6000, currentSrc: "blob:a" };
    for (const { ms, fn } of intervals) if (ms === 5000) fn();
    player.video = null;
    await settle();
    expect(toWorker.slice(before)).toEqual([
      { type: "finished", source: "threshold", progress: 0.99, contentId: 3 },
    ]);
  });

  it("relays a Ma liste change from its own window", async () => {
    const before = toWorker.length;
    const listener = pageListeners[0]?.fn as PageListener;
    listener({
      source: page,
      origin: "https://naka.cx",
      data: { channel: "mynaka/1", kind: "playlist" },
    });
    listener({
      source: {},
      origin: "https://naka.cx",
      data: { channel: "mynaka/1", kind: "playlist" },
    });
    await settle();
    expect(toWorker.slice(before)).toEqual([{ type: "playlist-changed" }]);
  });

  it("asks the worker for the cards to rate when the URL poll finds the home page", async () => {
    const before = toWorker.length;
    vi.stubGlobal("location", { href: "https://naka.cx/" });
    for (const { ms, fn } of intervals) if (ms === 1000) fn();
    await settle();
    vi.stubGlobal("location", { href: PLAYER });
    for (const { ms, fn } of intervals) if (ms === 1000) fn();
    await settle();
    expect(toWorker.slice(before)).toEqual([{ type: "rating-cards" }]);
  });

  it("nothing it sent or answered holds the token or the e-mail", async () => {
    const all = ask({ type: "naka-call", call: "playlistIds" });
    await settle();
    const seen = strings([toWorker, all.answers]).join(" ");
    expect(seen).not.toContain(TOKEN);
    expect(seen).not.toContain(EMAIL);
  });
});
