// What every job is built from. Only the entry file binds these to chrome.*; tests pass fakes.

import type { Store } from "../ext/store";
import type { ScClient } from "../sc/sc-client";
import type { AccountReaders } from "./binding";
import {
  createNakaProxy,
  type NakaProxy,
  type TabsPort,
  type Timer,
} from "./naka-proxy";
import { pinFirstTab } from "./pinned-tab";
import type { SiteLimiters } from "./read-ports";

export type JobDeps = {
  store: Store;
  tabs: TabsPort;
  sc: ScClient;
  /** The SensCritique username of the session, read at call time; never the token. */
  scUsername(): Promise<string>;
  /** Shared by every job: one per site. */
  limiters: SiteLimiters;
  now(): number;
  /** The local date, YYYY-MM-DD. */
  today(): string;
  /** The Naka call timeout's timer; the real one when absent. */
  timer?: Timer;
};

// A job's own Naka proxy, pinned to the first tab it finds.
export function jobNaka(deps: JobDeps): NakaProxy {
  return createNakaProxy(pinFirstTab(deps.tabs), deps.timer);
}

export function jobAccounts(naka: NakaProxy, deps: JobDeps): AccountReaders {
  return {
    nakaAccount: () => naka.account(),
    scUsername: () => deps.scUsername(),
  };
}
