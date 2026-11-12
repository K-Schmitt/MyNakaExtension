// Naka tab, MAIN world (the page's own environment): wraps the page's fetch to see "Ma liste" changes,
// explicit "vu", where the credits start, and the title page and season open, and posts them to this window
// for the isolated script. It holds nothing secret: it never reads the page's storage, and the events it
// posts carry ids, plus the title page's public titles and year.

import type { PageEvent } from "../ext/messages";
import { wrapFetch } from "./fetch-wrapper";

const NAKA_ORIGIN = "https://naka.cx";

function post(event: PageEvent): void {
  window.postMessage(event, NAKA_ORIGIN);
}

try {
  window.fetch = wrapFetch(window.fetch, post, () => location.href);
} catch {
  // The page's fetch stays as it was.
}
