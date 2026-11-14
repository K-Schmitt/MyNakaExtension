// What a title page rating is about to change (spec §7 « État d'avant »): the product's state is read
// through the SC limiter just before a film's or a series' rating, and kept as the one undo record,
// replacing any older one. A failed read never stops the rating: the record is then cleared (an older
// one would undo more than the last rating), and the panel offers no undo. Episode ratings keep nothing.

import type { FicheUndo, UndoRole } from "../core/fiche-undo";
import type { FicheRateMessage } from "../ext/fiche-messages";
import type { ProductState } from "../sc/sc-client";
import type { JobDeps } from "./job-deps";

/** The product's state before the rating, or undefined when SensCritique did not give it. */
async function readBefore(
  deps: JobDeps,
  productId: number,
): Promise<ProductState | undefined> {
  try {
    return await deps.limiters.sc.run(() => deps.sc.productState(productId));
  } catch {
    return undefined;
  }
}

function recordOf(
  deps: JobDeps,
  msg: FicheRateMessage,
  role: UndoRole,
  state: ProductState,
): FicheUndo {
  return {
    contentId: msg.contentId,
    productId: msg.productId,
    role,
    at: deps.now(),
    before: {
      rating: state.rating,
      isDone: state.isDone,
      dateDone: state.dateDone,
      isWished: state.isWished,
      inMaListe: role === "film" ? (msg.inMaListe ?? null) : null,
    },
  };
}

/** Stores the record of this rating, or clears any when the state was not read. */
async function keepUndo(
  deps: JobDeps,
  msg: FicheRateMessage,
  role: UndoRole,
  before: ProductState | undefined,
): Promise<void> {
  const record = before && recordOf(deps, msg, role, before);
  await deps.store.saveFicheUndo(record ?? null);
}

/** Reads and keeps the before-state of a film's or a series' rating; handed back for the answer's panel. */
export async function recordBefore(
  deps: JobDeps,
  msg: FicheRateMessage,
  role: UndoRole,
): Promise<ProductState | undefined> {
  const before = await readBefore(deps, msg.productId);
  await keepUndo(deps, msg, role, before);
  return before;
}
