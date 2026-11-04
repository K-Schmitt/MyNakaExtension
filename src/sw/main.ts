// Service worker entry: binds chrome.* and the worker's globals, nothing else.

import type { Fetch } from "../sc/sc-client";
import type { TabsPort, Timer } from "./naka-proxy";
import { createWorker } from "./worker";

const tabs: TabsPort = {
  query: async (url) => {
    const found = await chrome.tabs.query({ url, discarded: false });
    return found.flatMap((tab) =>
      tab.id === undefined ? [] : [{ id: tab.id }],
    );
  },
  send: (tabId, msg) => chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }),
};

const timer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const workerFetch: Fetch = (url, init) => fetch(url, init);

const router = createWorker({
  extensionId: chrome.runtime.id,
  storage: {
    get: (key) => chrome.storage.local.get(key),
    set: (items) => chrome.storage.local.set(items),
  },
  tabs,
  fetch: workerFetch,
  timer,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) =>
  router.handle(msg, sender, sendResponse),
);
