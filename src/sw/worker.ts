// Composes the service worker from what the entry file binds: storage, the tabs, fetch and the clock.
// The SensCritique token stays inside the session reader and the client built here; the binding reads
// the username only.

import { createRateLimiter } from "../core/rate-limiter";
import type { StorageArea } from "../ext/store";
import { createStore } from "../ext/store";
import { createScClient, type Fetch } from "../sc/sc-client";
import { createSessionReader } from "../sc/sc-session";
import { readScUsername } from "./binding";
import { createFicheRegistry } from "./fiche-registry";
import { createJobQueue } from "./job-queue";
import { createJobs } from "./jobs";
import { localDate } from "./local-date";
import type { TabsPort, Timer } from "./naka-proxy";
import { createRouter, type Router } from "./router";
import { withRequestTimeout } from "./timed-fetch";

// One search or content read per site every 2 s, shared by every job of this worker.
const SEARCHES_PER_WINDOW = 1;
const SEARCH_WINDOW_MS = 2000;

export type WorkerEnv = {
  extensionId: string;
  storage: StorageArea;
  /** chrome.storage.session: the products issued to the title pages, kept across worker restarts. */
  session: StorageArea;
  tabs: TabsPort;
  fetch: Fetch;
  timer: Timer;
  now(): number;
  sleep(ms: number): Promise<void>;
};

export function createWorker(env: WorkerEnv): Router {
  const fetch = withRequestTimeout(env.fetch, env.timer);
  const scDeps = { fetch, getSession: createSessionReader(fetch) };
  const clock = { now: env.now, sleep: env.sleep };
  const limiter = () =>
    createRateLimiter(clock, SEARCHES_PER_WINDOW, SEARCH_WINDOW_MS);
  const registry = createFicheRegistry(env.session);
  const jobs = createJobs(
    {
      store: createStore(env.storage),
      tabs: env.tabs,
      sc: createScClient(scDeps),
      scUsername: () => readScUsername(scDeps),
      limiters: { naka: limiter(), sc: limiter() },
      now: env.now,
      today: () => localDate(new Date(env.now())),
      timer: env.timer,
    },
    registry,
  );
  return createRouter({
    extensionId: env.extensionId,
    queue: createJobQueue(),
    jobs,
    timer: env.timer,
    now: env.now,
  });
}
