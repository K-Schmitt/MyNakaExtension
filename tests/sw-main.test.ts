import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The service worker entry against a fake `chrome`: what it binds, and how (Ruling 9).
const EXT = "abcdefghijklmnopabcdefghijklmnop";
const PLAYER = "https://naka.cx/player?id=3&type=movie";
const NAKA_TAB = { id: EXT, url: PLAYER, frameId: 0, tab: { url: PLAYER } };
const STATUS_URL = `chrome-extension://${EXT}/status.html`;

type Listener = (
  msg: unknown,
  sender: object,
  respond: (answer: unknown) => void,
) => boolean;

const listeners: Listener[] = [];
const queries: unknown[] = [];
const sends: unknown[][] = [];
const stored = new Map<string, unknown>();
const fetched: string[] = [];

const fakeChrome = {
  runtime: {
    id: EXT,
    onMessage: { addListener: (fn: Listener) => listeners.push(fn) },
  },
  tabs: {
    query: async (info: unknown) => {
      queries.push(info);
      return [{ url: "https://naka.cx/" }, { id: 5, url: "https://naka.cx/" }];
    },
    sendMessage: async (...args: unknown[]) => {
      sends.push(args);
      return { ok: true, value: "77" };
    },
  },
  storage: {
    local: {
      get: async (key: string) =>
        stored.has(key) ? { [key]: stored.get(key) } : {},
      set: async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items))
          stored.set(key, value);
      },
    },
  },
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeAll(async () => {
  vi.stubGlobal("chrome", fakeChrome);
  vi.stubGlobal("fetch", async (url: string) => {
    fetched.push(url);
    return { ok: true, status: 200, text: async () => "<html></html>" };
  });
  await import("../src/sw/main");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("service worker entry", () => {
  it("listens to runtime messages once", () => {
    expect(listeners).toHaveLength(1);
  });

  it("asks the top frame of the first Naka tab that has an id and is not discarded", async () => {
    const listener = listeners[0] as Listener;
    expect(listener({ type: "naka-ready" }, NAKA_TAB, () => undefined)).toBe(
      false,
    );
    await settle();
    expect(queries[0]).toEqual({ url: "https://naka.cx/*", discarded: false });
    expect(sends[0]).toEqual([5, { type: "naka-account" }, { frameId: 0 }]);
    expect(fetched).toEqual(["https://www.senscritique.com/"]);
  });

  it("answers the status page, and stores through chrome.storage.local", async () => {
    const listener = listeners[0] as Listener;
    const answers: unknown[] = [];
    const sender = { id: EXT, url: STATUS_URL, tab: { url: STATUS_URL } };
    expect(listener({ type: "status" }, sender, (a) => answers.push(a))).toBe(
      true,
    );
    await settle();
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      mode: "simulation",
      lastRun: {
        trigger: "naka-ready",
        outcome: "failed",
        error: "sc-session",
      },
    });
    expect(stored.get("settings")).toMatchObject({
      lastRun: { trigger: "naka-ready", error: "sc-session" },
    });
  });
});
