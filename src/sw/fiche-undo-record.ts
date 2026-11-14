// What a title page rating is about to change (spec §7 « État d'avant »): the product's state is read
// through the SC limiter just before a film's or a series' rating, and kept as the one undo record,
// replacing any older one. A failed read never stops the rating: the record is then cleared (an older
// one would undo more than the last rating), and the panel offers no undo. Episode ratings keep nothing.
// The record also keeps the extension's own state of the title (ruling R8), read in the same job before
// any write: the handled key, the settled pair, the title's cards as stored. A local read that fails
// clears the record the same way. A film the worker's client took out of « Ma liste » while the tab could
// not read the button is noted as listed (ruling R10), so « Annuler » adds it back.

import type { FicheUndo, UndoLocal, UndoRole } from "../core/fiche-undo";
import type { FicheRateMessage } from "../ext/fiche-messages";
import type { ProductState } from "../sc/sc-client";
import {
  type CardTitle,
  isSettled,
  isTitleCard,
  isTitleHandled,
} from "./fiche-local-restore";
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

/** The title's local state now, or undefined when the store cannot give it. */
async function readLocal(
  deps: JobDeps,
  title: CardTitle,
): Promise<UndoLocal | undefined> {
  try {
    const state = await deps.store.loadState();
    const cards = await deps.store.loadRatings();
    return {
      handled: isTitleHandled(state, title),
      settled: isSettled(state, title),
      cards: cards.filter((card) => isTitleCard(card, title)),
    };
  } catch {
    return undefined;
  }
}

function recordOf(
  deps: JobDeps,
  msg: FicheRateMessage,
  role: UndoRole,
  state: ProductState,
  local: UndoLocal,
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
    local,
  };
}

/** Stores the record of this rating, or clears any when a state was not read. */
async function keepUndo(
  deps: JobDeps,
  msg: FicheRateMessage,
  role: UndoRole,
  before: ProductState | undefined,
): Promise<void> {
  const title = { role, contentId: msg.contentId, productId: msg.productId };
  const local = before && (await readLocal(deps, title));
  const record = before && local && recordOf(deps, msg, role, before, local);
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

/** The film was listed: kept only on a record that still names this content and this product (R10). */
export async function noteListed(
  deps: JobDeps,
  { contentId, productId }: FicheRateMessage,
): Promise<void> {
  try {
    const record = await deps.store.loadFicheUndo();
    if (record?.contentId !== contentId || record.productId !== productId) {
      return;
    }
    const before = { ...record.before, inMaListe: true };
    await deps.store.saveFicheUndo({ ...record, before });
  } catch {
    // The rating went out: the record then simply gives no « Ma liste » back.
  }
}
