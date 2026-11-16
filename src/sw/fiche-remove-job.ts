// « Retirer la note » on a title page (fiche-remove, spec §6 decision 2 and §7), queued like every write.
// Refused before any request unless the product is issued to the asking tab as that content's title.
// The product's state is read again: a title with a critique or a recommendation (ProductUndone could
// erase it, decision 6) or with no rating is refused with no write. The binding is checked, then the one
// ProductUndone takes the rating, « vu » and its date. No list is touched and the link stays; the cards
// naming the product lose its rating, and the undo record of this very title goes (« Annuler » would put
// back the rating just taken off). A card or a record that cannot be saved then is not an error: the
// removal is a fact on SensCritique, the card only shows it.

import { canRemove } from "../core/fiche-undo";
import type { FicheRemoveMessage } from "../ext/fiche-messages";
import type { RemoveAnswer } from "../ext/fiche-undo-answers";
import type { ProductState } from "../sc/sc-client";
import { checkBinding } from "./binding";
import type { FicheAsker } from "./fiche-asker";
import { issuedTitle } from "./fiche-issued";
import { type CardTitle, unrateCards } from "./fiche-local-restore";
import { type JobDeps, jobAccounts, jobNaka } from "./job-deps";
import { toJobError } from "./to-job-error";

function refusalOf(state: ProductState): RemoveAnswer | undefined {
  if (canRemove(state)) return undefined;
  return state.rating === null
    ? { refused: "unrated" }
    : { refused: "protected" };
}

async function removeOnSc(
  deps: JobDeps,
  productId: number,
): Promise<RemoveAnswer | undefined> {
  try {
    const state = await deps.limiters.sc.run(() =>
      deps.sc.productState(productId),
    );
    const refusal = refusalOf(state);
    if (refusal !== undefined) return refusal;
    const settings = await deps.store.loadSettings();
    await checkBinding(settings.binding, jobAccounts(jobNaka(deps), deps));
    await deps.limiters.sc.run(() => deps.sc.unmarkDone(productId));
    return undefined;
  } catch (error) {
    return { error: toJobError(error) };
  }
}

/** The undo record of this title, if it is the stored one, cleared. */
async function forgetUndo(deps: JobDeps, title: CardTitle): Promise<void> {
  try {
    const record = await deps.store.loadFicheUndo();
    const same =
      record?.contentId === title.contentId &&
      record.productId === title.productId;
    if (same) await deps.store.saveFicheUndo(null);
  } catch {
    // See the header: the removal went out.
  }
}

async function unrateTitle(deps: JobDeps, title: CardTitle): Promise<void> {
  try {
    await unrateCards(deps.store, title);
  } catch {
    // See the header: the removal went out.
  }
}

export async function ficheRemoveJob(
  deps: JobDeps,
  asker: FicheAsker,
  { contentId, productId }: FicheRemoveMessage,
): Promise<RemoveAnswer> {
  const role = await issuedTitle(asker, contentId, productId);
  const failed = await removeOnSc(deps, productId);
  if (failed !== undefined) return failed;
  const title = { role, contentId, productId };
  await unrateTitle(deps, title);
  await forgetUndo(deps, title);
  return { ok: true };
}
