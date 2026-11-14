// Whether a step wrote anything yet (D9): the deps of one step, with each SensCritique write and each save of
// the sync state (the settled pair, the handled key) noted as it starts. A write that throws may still have
// reached SensCritique, so it counts. The settings' saves (the hour's slot, the finish record) and the cards
// are bookkeeping of the step, not counted. A new ScClient method fails the compile until it is sorted here.

import type { Store } from "../ext/store";
import type { ScClient } from "../sc/sc-client";
import type { JobDeps } from "./job-deps";

type ScRead = "productState" | "readWishlist" | "search" | "seasonInfo";
type ScWrite = Exclude<keyof ScClient, ScRead>;

export type Watched = { deps: JobDeps; wrote(): boolean };

function noted<T>(note: () => void, write: () => Promise<T>): Promise<T> {
  note();
  return write();
}

function watchedSc(sc: ScClient, note: () => void): ScClient {
  const writes: Pick<ScClient, ScWrite> = {
    wish: (id) => noted(note, () => sc.wish(id)),
    unwish: (id) => noted(note, () => sc.unwish(id)),
    markDone: (id, date) => noted(note, () => sc.markDone(id, date)),
    markDoneWithoutDate: (id) => noted(note, () => sc.markDoneWithoutDate(id)),
    unmarkDone: (id) => noted(note, () => sc.unmarkDone(id)),
    rate: (id, rating) => noted(note, () => sc.rate(id, rating)),
  };
  return { ...sc, ...writes };
}

function watchedStore(store: Store, note: () => void): Store {
  return {
    ...store,
    saveState: (state) => noted(note, () => store.saveState(state)),
  };
}

export function watchWrites(deps: JobDeps): Watched {
  let wrote = false;
  const note = () => {
    wrote = true;
  };
  const sc = watchedSc(deps.sc, note);
  const store = watchedStore(deps.store, note);
  return { deps: { ...deps, sc, store }, wrote: () => wrote };
}
