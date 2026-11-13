// Naka tab, MAIN world (the page's own environment): wraps the page's fetch to see "Ma liste" changes,
// explicit "vu", where the credits start, and the title page and season open, and posts them to this window
// for the isolated script. It keeps the title page events, bounded, and posts them again when the tab
// announces a visit of that title. It holds nothing secret: it never reads the page's storage, and the
// events it posts carry ids, plus the title page's public titles and year.

import type { PageEvent } from "../ext/messages";
import { wrapFetch } from "./fetch-wrapper";
import { createFicheMemory } from "./fiche-memory";
import { replayOnVisit } from "./fiche-replay";

const NAKA_ORIGIN = "https://naka.cx";
const memory = createFicheMemory();

function send(event: PageEvent): void {
  window.postMessage(event, NAKA_ORIGIN);
}

function post(event: PageEvent): void {
  memory.keep(event);
  send(event);
}

try {
  window.fetch = wrapFetch(window.fetch, post, () => location.href);
} catch {
  // The page's fetch stays as it was.
}
try {
  window.addEventListener("message", replayOnVisit(window, memory, send));
} catch {
  // No replay: the tab sees only the events posted while it listens.
}
