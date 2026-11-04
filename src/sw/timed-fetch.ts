// Every worker request to SensCritique ends within 30 s (Ruling 16): Apollo, the home-page session read
// and the www pages. One job holds the queue, so a request that never answered would hold every later job.
// The timer covers the whole exchange, body read included, and is never cleared: aborting a request
// whose body was already read changes nothing. The request itself is kept field for field.

import type { Fetch } from "../sc/sc-client";
import type { Timer } from "./naka-proxy";

export const SC_REQUEST_TIMEOUT_MS = 30_000;

export function withRequestTimeout(fetch: Fetch, timer: Timer): Fetch {
  return (url, init) => {
    const controller = new AbortController();
    timer.set(() => controller.abort(), SC_REQUEST_TIMEOUT_MS);
    return fetch(url, { ...init, signal: controller.signal });
  };
}
