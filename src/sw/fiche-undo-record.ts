// What a title page rating is about to change (its « État d'avant »): the product's state is read through the
// SC limiter just before a film's or a series' rating, and kept as the one undo record, replacing any older
// one. A failed read never stops the rating: the record is then cleared (an older one would undo more than
// the last rating), and the panel offers no undo. Episode ratings keep nothing. The record also keeps the
// extension's own state of the title, read in the same job before any write: the handled key, the settled
// pair, the title's cards as stored. A local read that fails clears the record the same way. A film the
// worker's client took out of « Ma liste » while the tab could not read the button is noted as listed, so
// « Annuler » adds it back. A rating answered `{ error }` puts the record it replaced back only when nothing of
// it was written (write-watch): a refusal before any write (the binding, the hour's budget, the pre-check, a
// state read before the first write) or a ProductRate that threw with nothing sent before it (a film with its
// card, a series). A film whose explicit finish wrote (« vu », out of the wishes, the settled pair, the
// handled key) keeps this rating's record, so « Annuler » restores it from its before-state.

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
      dejaVuOn: role === "film" ? (msg.dejaVuOn ?? null) : null,
    },
    local,
  };
}

/** Clears the stored record; a store that refuses leaves the older one, which then names another rating. */
async function clearRecord(deps: JobDeps): Promise<void> {
  try {
    await deps.store.saveFicheUndo(null);
  } catch {
    // The rating goes out either way, with no « Annuler ».
  }
}

/**
 * Stores the record of this rating, or clears any when a state was not read; the record stored, if any.
 * A save that fails never stops the rating: the record is cleared and the panel offers no undo.
 */
async function keepUndo(
  deps: JobDeps,
  msg: FicheRateMessage,
  role: UndoRole,
  before: ProductState | undefined,
): Promise<FicheUndo | undefined> {
  const title = { role, contentId: msg.contentId, productId: msg.productId };
  const local = before && (await readLocal(deps, title));
  const record =
    before && local ? recordOf(deps, msg, role, before, local) : undefined;
  try {
    await deps.store.saveFicheUndo(record ?? null);
    return record;
  } catch {
    await clearRecord(deps);
    return undefined;
  }
}

/** The record stored now: null when there is none, undefined when the store could not give it. */
async function storedRecord(
  deps: JobDeps,
): Promise<FicheUndo | null | undefined> {
  try {
    return await deps.store.loadFicheUndo();
  } catch {
    return undefined;
  }
}

/** What a film's or a series' rating found before its write: the product's state, the record kept, the one it replaced. */
export type KeptBefore = {
  state: ProductState | undefined;
  record: FicheUndo | undefined;
  replaced: FicheUndo | null | undefined;
};

/** Reads and keeps the before-state of a film's or a series' rating; handed back for the answer's panel. */
export async function recordBefore(
  deps: JobDeps,
  msg: FicheRateMessage,
  role: UndoRole,
): Promise<KeptBefore> {
  const replaced = await storedRecord(deps);
  const state = await readBefore(deps, msg.productId);
  const record = await keepUndo(deps, msg, role, state);
  return { state, record, replaced };
}

/** The rating did not go out: the record it replaced is stored again, so the earlier « Annuler » still holds. */
export async function putBackReplaced(
  deps: JobDeps,
  { replaced }: KeptBefore,
): Promise<void> {
  if (replaced === undefined) return;
  try {
    await deps.store.saveFicheUndo(replaced);
  } catch {
    // The rating's error is answered either way; « Annuler » then answers « expired ».
  }
}

/** The film was listed: kept only on a record that still names this content and this product. */
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
