// Naka tab, ISOLATED world: binds chrome.*, the window, the DOM and the timers, nothing else (the rating
// blocks and their rules are wired in ui/blocks-wiring). The page's token is read here, inside the client's
// token function, and goes only into the client's requests to the Naka API.

import type { ToWorker } from "../ext/messages";
import { createNakaClient } from "../naka/naka-client";
import type { Fetch } from "../sc/sc-client";
import { readAccount } from "./naka-bridge";
import { startNakaTab } from "./naka-tab";
import { createTabListener } from "./naka-tab-listener";
import { readNakaToken } from "./naka-token";
import { listenToPauses } from "./pause-events";
import { createTitleLookup } from "./title-lookup";
import { wireBlocks } from "./ui/blocks-wiring";
import { createEndUi } from "./ui/end-ui";
import { homeRowPorts } from "./ui/home-row-page";
import { createHomeRowUi } from "./ui/home-row-ui";
import { createWorkerPort } from "./ui/worker-port";
import { readVideo } from "./video-sample";

function ignore(): void {}

// The worker may be waking up, or the extension reloaded under the page: a lost message is a lost
// candidate, never an error on the page.
function sendToWorker(msg: ToWorker): void {
  try {
    chrome.runtime.sendMessage(msg).catch(ignore);
  } catch {
    // The extension context is gone.
  }
}

const tabFetch: Fetch = (url, init) => fetch(url, init);

const client = createNakaClient({
  fetch: tabFetch,
  token: () => readNakaToken(localStorage),
});

chrome.runtime.onMessage.addListener(
  createTabListener(chrome.runtime.id, client, () => readAccount(localStorage)),
);

const blocks = wireBlocks({
  port: createWorkerPort((msg) => chrome.runtime.sendMessage(msg)),
  timer: {
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
  playerUi: createEndUi(document),
  homeUi: createHomeRowUi(homeRowPorts(document)),
  now: () => Date.now(),
  titleOf: createTitleLookup((contentId) => client.contentById(contentId)),
});

listenToPauses(document, {
  paused: blocks.paused,
  resumed: blocks.resumed,
});

startNakaTab({
  self: window,
  href: () => location.href,
  video: () => readVideo(document),
  every: (ms, fn) => {
    setInterval(fn, ms);
  },
  onPageMessage: (fn) => {
    window.addEventListener("message", fn);
  },
  send: sendToWorker,
  finished: blocks.finished,
  urlChanged: blocks.urlChanged,
  pathChanged: blocks.pathChanged,
  removed: blocks.removed,
  // The title page controller and its blocks are wired with their UI (plan 7, task 9).
  fiche: { path: ignore, event: ignore },
});
