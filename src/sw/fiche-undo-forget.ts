// The title page's undo record is the title's last rating (spec 8 §2, D12): a later write of the same content
// from another surface (a rating from the pause block or the home row, a finish, « Oublier ») clears it, so
// « Annuler » can never put back a state from before that newer write. Only the record naming that content
// goes. The write it follows has happened: a store that fails here fails nothing (the record then simply
// expires within ten minutes).

import type { Store } from "../ext/store";
import type { JobDeps } from "./job-deps";
import { watchWrites } from "./write-watch";

type UndoStore = Pick<Store, "loadFicheUndo" | "saveFicheUndo">;

/** The undo record, cleared when it names this content. */
export async function forgetUndoOf(
  store: UndoStore,
  contentId: number,
): Promise<void> {
  try {
    const record = await store.loadFicheUndo();
    if (record?.contentId === contentId) await store.saveFicheUndo(null);
  } catch {
    // See the header.
  }
}

/** Runs the job; once it wrote anything for this content (write-watch), its undo record goes. */
export async function forgettingUndo<T>(
  deps: JobDeps,
  contentId: number,
  job: (deps: JobDeps) => Promise<T>,
): Promise<T> {
  const watched = watchWrites(deps);
  try {
    return await job(watched.deps);
  } finally {
    if (watched.wrote()) await forgetUndoOf(deps.store, contentId);
  }
}
