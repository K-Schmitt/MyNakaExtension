// Every worker request to SensCritique ends within 30 s (Ruling 16): Apollo, the home-page session read
// and the www pages. One job holds the queue, so a request that never answered would hold every later job.
// The timer covers the whole exchange, body read included, and is never cleared: aborting a request
// whose body was already read changes nothing. The request itself is kept field for field.
// Once the timer fired, the request or its body read fails with the fixed ScTimeoutError, whatever the
// fetch threw (K4): sc-transport's `send` names the operation, and the port's breaker opens on it.

import type { Fetch } from "../sc/sc-client";
import { ScTimeoutError } from "../sc/sc-errors";
import type { Timer } from "./naka-proxy";

export const SC_REQUEST_TIMEOUT_MS = 30_000;

type Answer = Awaited<ReturnType<Fetch>>;

// What the fetch threw is dropped once the timer fired: it may quote the request, token included.
function failure(signal: AbortSignal, error: unknown): unknown {
  return signal.aborted ? new ScTimeoutError("request") : error;
}

function timedBody(answer: Answer, signal: AbortSignal): Answer {
  return {
    ok: answer.ok,
    status: answer.status,
    text: () =>
      answer.text().catch((error: unknown) => {
        throw failure(signal, error);
      }),
  };
}

export function withRequestTimeout(fetch: Fetch, timer: Timer): Fetch {
  return async (url, init) => {
    const controller = new AbortController();
    timer.set(() => controller.abort(), SC_REQUEST_TIMEOUT_MS);
    const { signal } = controller;
    try {
      return timedBody(await fetch(url, { ...init, signal }), signal);
    } catch (error) {
      throw failure(signal, error);
    }
  };
}
