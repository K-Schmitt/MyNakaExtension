// Naka tab, ISOLATED world: binds chrome.*, the window and the DOM, nothing else. The page's token is read
// here, inside the client's token function, and goes only into the client's requests to the Naka API.

import type { ContentIds } from "../core/finish-event";
import type { ToWorker } from "../ext/messages";
import { createNakaClient } from "../naka/naka-client";
import type { Fetch } from "../sc/sc-client";
import { readAccount } from "./naka-bridge";
import { startNakaTab } from "./naka-tab";
import { createTabListener } from "./naka-tab-listener";
import { readNakaToken } from "./naka-token";
import { listenToPauses } from "./pause-events";
import { createTitleLookup } from "./title-lookup";
import { createEndBlock } from "./ui/end-block";
import { createEndUi } from "./ui/end-ui";
import { createPauseBlock } from "./ui/pause-block";
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

const ui = createEndUi(document);
const port = createWorkerPort((msg) => chrome.runtime.sendMessage(msg));
const timer = {
  set: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clear: (handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const endBlock = createEndBlock({
  port,
  timer,
  show: ui.show,
  hide: ui.hide,
});

// The pause block draws in the same overlay: it never clears what the end block put there.
const pauseBlock = createPauseBlock({
  port,
  timer,
  show: ui.show,
  hide: () => {
    if (!endBlock.isShown()) ui.hide();
  },
  now: () => Date.now(),
  endShown: () => endBlock.isShown(),
  titleOf: createTitleLookup((contentId) => client.contentById(contentId)),
});

let playing: ContentIds | undefined;
listenToPauses(document, {
  paused: (sample) => pauseBlock.paused(sample, playing),
  resumed: () => pauseBlock.resumed(),
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
  finished: (ids) => endBlock.finished(ids),
  urlChanged: (ids) => {
    playing = ids;
    pauseBlock.urlChanged(Date.now());
  },
});
