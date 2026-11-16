// The title panel's flags (spec §6 decisions 1, 2, 6): « Annuler » while a live undo record names this very
// title and product, « Retirer la note » for a rated product with no critique or recommendation, and the
// product's page, and whether a critique or recommendation is tied to its rating (an unrated title has no
// rating to take off, so no protected line). Unknown flags fail closed: no undo, no removal, no link, no
// protected line.

import {
  canRemove,
  type FicheUndo,
  isProtected,
  liveUndo,
  UNDO_WINDOW_MS,
} from "../core/fiche-undo";
import type { PanelFlags } from "../ext/fiche-answers";
import type { ProductState } from "../sc/sc-client";
import type { JobDeps } from "./job-deps";

export type PanelState = Pick<
  ProductState,
  "rating" | "isReviewed" | "isRecommended" | "url"
>;

const NO_PANEL: PanelFlags = {
  canUndo: false,
  canRemove: false,
  protected: false,
};

/** `undoLeftMs`: how long the undo record stays live, 0 without one. */
function panelFlags(state: PanelState, undoLeftMs: number): PanelFlags {
  const flags: PanelFlags = {
    canUndo: undoLeftMs > 0,
    canRemove: canRemove(state),
    protected: state.rating !== null && isProtected(state),
  };
  if (undoLeftMs > 0) flags.undoLeftMs = undoLeftMs;
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

/** How long the stored record still undoes this product of this title: 0 when it does not. */
function undoLeft(
  record: FicheUndo | null,
  title: TitleIds,
  now: number,
): number {
  if (record === null || !undoLive(record, title, now)) return 0;
  return record.at + UNDO_WINDOW_MS - now;
}

/** The flags of a product read now, with the undo record as stored. */
export async function storedFlags(
  deps: Pick<JobDeps, "store" | "now">,
  title: TitleIds,
  state: PanelState,
): Promise<PanelFlags> {
  const record = await deps.store.loadFicheUndo();
  return panelFlags(state, undoLeft(record, title, deps.now()));
}

/**
 * The flags once a rating went out: undo only when its record was stored, for what is left of its window
 * now (the record was made before the write), removal judged on the new rating.
 */
export function afterRating(
  before: PanelState | undefined,
  rating: number,
  record: FicheUndo | undefined,
  now: number,
): PanelFlags {
  if (before === undefined) return NO_PANEL;
  const left = record === undefined ? 0 : undoLeft(record, record, now);
  return panelFlags({ ...before, rating }, left);
}
