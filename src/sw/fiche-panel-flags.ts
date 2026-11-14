// The title panel's flags (spec §6 decisions 1, 2, 6): « Annuler » while a live undo record names this very
// title and product, « Retirer la note » for a rated product with no critique or recommendation, and the
// product's page, and whether a critique or recommendation is tied to it. Unknown flags fail closed: no undo,
// no removal, no link, no protected line.

import {
  canRemove,
  type FicheUndo,
  isProtected,
  liveUndo,
} from "../core/fiche-undo";
import type { PanelFlags } from "../ext/fiche-answers";
import type { ProductState } from "../sc/sc-client";
import type { JobDeps } from "./job-deps";

export type PanelState = Pick<
  ProductState,
  "rating" | "isReviewed" | "isRecommended" | "url"
>;

export const NO_PANEL: PanelFlags = {
  canUndo: false,
  canRemove: false,
  protected: false,
};

export function panelFlags(state: PanelState, canUndo: boolean): PanelFlags {
  const flags = {
    canUndo,
    canRemove: canRemove(state),
    protected: isProtected(state),
  };
  return state.url === undefined ? flags : { ...flags, url: state.url };
}

export type TitleIds = { contentId: number; productId: number };

/** Whether the stored record undoes this product of this title now. */
export function undoLive(
  record: FicheUndo | null,
  title: TitleIds,
  now: number,
): boolean {
  const live = liveUndo(record, title.contentId, now);
  return live !== undefined && live.productId === title.productId;
}

/** The flags of a product read now, with the undo record as stored. */
export async function storedFlags(
  deps: Pick<JobDeps, "store" | "now">,
  title: TitleIds,
  state: PanelState,
): Promise<PanelFlags> {
  const record = await deps.store.loadFicheUndo();
  return panelFlags(state, undoLive(record, title, deps.now()));
}

/** The flags once a rating went out: undo when its record was kept, removal judged on the new rating. */
export function afterRating(
  before: PanelState | undefined,
  rating: number,
): PanelFlags {
  return before === undefined
    ? NO_PANEL
    : panelFlags({ ...before, rating }, true);
}
