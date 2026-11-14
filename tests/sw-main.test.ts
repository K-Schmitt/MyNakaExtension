import { readFileSync } from "node:fs";
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
const clicks: ((tab: unknown) => void)[] = [];
const removedListeners: ((tabId: number) => void)[] = [];
const opened = { count: 0, fail: false };
const queries: unknown[] = [];
const sends: unknown[][] = [];
const stored = new Map<string, unknown>();
const sessionReads: string[] = [];
const fetched: string[] = [];

const fakeChrome = {
  runtime: {
    id: EXT,
    onMessage: { addListener: (fn: Listener) => listeners.push(fn) },
    openOptionsPage: async () => {
      opened.count += 1;
      if (opened.fail) throw new Error("Could not create an options page.");
    },
  },
  action: {
    onClicked: { addListener: (fn: (tab: unknown) => void) => clicks.push(fn) },
  },
  tabs: {
    onRemoved: {
      addListener: (fn: (tabId: number) => void) => removedListeners.push(fn),
    },
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
    session: {
      get: async (key: string) => {
        sessionReads.push(key);
        return {};
      },
      set: async () => undefined,
    },
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

// The file's one naka-ready, sent at setup: an automatic run waits out its gap, so a second one would
// start nothing, and the status test reads the record this one leaves.
const atNakaReady = {
  returned: true,
  queries: [] as unknown[],
  sends: [] as unknown[][],
  fetched: [] as string[],
};

async function sendNakaReady(): Promise<void> {
  const listener = listeners[0] as Listener;
  atNakaReady.returned = listener(
    { type: "naka-ready" },
    NAKA_TAB,
    () => undefined,
  );
  await settle();
  atNakaReady.queries = [...queries];
  atNakaReady.sends = [...sends];
  atNakaReady.fetched = [...fetched];
}

beforeAll(async () => {
  vi.stubGlobal("chrome", fakeChrome);
  vi.stubGlobal("fetch", async (url: string) => {
    fetched.push(url);
    return { ok: true, status: 200, text: async () => "<html></html>" };
  });
  // Without isolation, the entry may already be loaded by another file: bind it again to this fake.
  vi.resetModules();
  await import("../src/sw/main");
  await sendNakaReady();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("service worker entry", () => {
  it("listens to runtime messages once", () => {
    expect(listeners).toHaveLength(1);
  });

  it("keeps the title page registry in chrome.storage.session", async () => {
    const listener = listeners[0] as Listener;
    const tab = { ...NAKA_TAB, tab: { id: 9, url: PLAYER } };
    const answers: unknown[] = [];
    const mine = { type: "fiche-mine", contentId: 5, productId: 77 };
    expect(listener(mine, tab, (a) => answers.push(a))).toBe(true);
    await settle();
    await settle();
    expect(sessionReads).toContain("ficheRegistry");
    expect(answers).toEqual([undefined]);
  });

  it("does not listen to closed tabs: the worker is not woken by each tab close", () => {
    expect(removedListeners).toHaveLength(0);
  });

  it("asks the top frame of the first Naka tab that has an id and is not discarded", () => {
    expect(atNakaReady.returned).toBe(false);
    expect(atNakaReady.queries[0]).toEqual({
      url: "https://naka.cx/*",
      discarded: false,
    });
    expect(atNakaReady.sends[0]).toEqual([
      5,
      { type: "naka-account" },
      { frameId: 0 },
    ]);
    expect(atNakaReady.fetched).toEqual(["https://www.senscritique.com/"]);
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

// M8: the toolbar button opens the status page, which is the extension's options page.
describe("the toolbar button", () => {
  it("one click opens the status page once", async () => {
    expect(clicks).toHaveLength(1);
    const before = opened.count;
    clicks[0]?.({ id: 7, url: "https://naka.cx/" });
    await settle();
    expect(opened.count - before).toBe(1);
  });

  it("a page that cannot open becomes no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    opened.fail = true;
    try {
      clicks[0]?.({ id: 7 });
      await settle();
      await settle();
      expect(unhandled).toEqual([]);
    } finally {
      opened.fail = false;
      process.off("unhandledRejection", listener);
    }
  });

  it("needs no new permission: the button has no popup, the status page is the options page", () => {
    const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.action).toEqual({});
    expect(manifest.options_page).toBe("status.html");
  });
});
