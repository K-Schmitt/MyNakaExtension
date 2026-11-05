// Builds the SyncPorts of ONE job: its circuit breakers and its describe caches live as long as the job.
// The limiters come from the caller and are shared by every job.

import type { SyncPorts } from "../core/sync-runner";
import type { Write } from "../core/sync-writes";
import type { Titled } from "../core/title-match";
import type { Mode } from "../ext/settings";
import type { Store } from "../ext/store";
import type { NakaClient } from "../naka/naka-client";
import type { ScClient } from "../sc/sc-client";
import { withBreaker } from "./circuit-breaker";
import {
  createWishlist,
  readNakaTitle,
  remembered,
  type SiteLimiters,
  searchNakaCandidates,
  searchScBoth,
} from "./read-ports";
import { type PlannedWrite, writePorts } from "./write-ports";

export type { PlannedWrite } from "./write-ports";

export type SyncPortDeps = {
  naka: NakaClient;
  sc: ScClient;
  limiters: SiteLimiters;
  store: Store;
  mode: Mode;
  /** Hears the error that opened any port's breaker. */
  onStop?: (error: Error) => void;
};

export type Describe = {
  naka(id: number): Promise<Titled | undefined>;
  sc(id: number): Promise<Titled | undefined>;
};

export type SyncSession = {
  ports: SyncPorts;
  /** The writes a simulated run made instead of writing, in order. Always empty in live mode. */
  planned: PlannedWrite[];
  /** The run's describe caches, for the preview. */
  describe: Describe;
  /** The writes the run deferred to the next pass, in order, both modes. */
  deferredWrites: Write[];
};

export function buildSyncPorts(deps: SyncPortDeps): SyncSession {
  const { naka, sc, limiters, store, onStop } = deps;
  const guard = <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    withBreaker(call, onStop);
  const wishlist = createWishlist(sc);
  const planned: PlannedWrite[] = [];
  const deferredWrites: Write[] = [];
  const writes = writePorts(deps.mode, naka, sc, planned);
  const describe: Describe = {
    naka: remembered(
      guard((id: number) => readNakaTitle(naka, limiters.naka, id)),
    ),
    sc: async (id) => wishlist.describe(id),
  };
  const ports: SyncPorts = {
    load: () => store.loadState(),
    save: (state) => store.saveState(state),
    nakaIds: guard(() => naka.playlistIds()),
    scWishlistIds: guard(() => wishlist.ids()),
    describeNaka: describe.naka,
    describeSc: describe.sc,
    searchNaka: guard((q: string) =>
      searchNakaCandidates(naka, limiters.naka, q),
    ),
    searchSc: guard((q: string) => searchScBoth(sc, limiters.sc, q)),
    addToNaka: guard((id: number) => writes.addToNaka(id)),
    addToSc: guard((id: number) => writes.addToSc(id)),
    deferred: (list) => {
      deferredWrites.push(...list);
    },
  };
  return { ports, planned, describe, deferredWrites };
}
