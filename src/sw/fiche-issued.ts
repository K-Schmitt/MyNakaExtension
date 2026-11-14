// The gate of every title page write: the product must be one the worker issued to the asking tab for
// that content, as what the write names (fiche-roles); « Annuler » and « Retirer la note » name the title,
// a film's or a series'. A registry that cannot be read counts as not issued. Throws before any request.

import type { UndoRole } from "../core/fiche-undo";
import type { FicheAsker } from "./fiche-info-job";
import { NotIssuedError } from "./fiche-mine-job";
import type { FicheTitle } from "./fiche-registry-schema";
import type { FicheRole } from "./fiche-roles";

async function issuedAs(
  { registry, tabId }: FicheAsker,
  contentId: number,
  productId: number,
  role: FicheRole,
): Promise<boolean> {
  try {
    return await registry.issuedAs(tabId, contentId, productId, role);
  } catch {
    return false;
  }
}

async function titleOf(
  { registry, tabId }: FicheAsker,
  contentId: number,
): Promise<FicheTitle | undefined> {
  try {
    return await registry.titleOf(tabId, contentId);
  } catch {
    return undefined;
  }
}

/** The series' product issued to the tab as that content's title, which an episode's star links (D6). */
export async function issuedSeries(
  asker: FicheAsker,
  contentId: number,
): Promise<number> {
  const title = await titleOf(asker, contentId);
  if (title?.type !== "serie") throw new NotIssuedError();
  return title.productId;
}

export async function assertIssued(
  asker: FicheAsker,
  contentId: number,
  productId: number,
  role: FicheRole,
): Promise<void> {
  if (!(await issuedAs(asker, contentId, productId, role))) {
    throw new NotIssuedError();
  }
}

/** The role the product was issued under as that content's title (a film's or a series'), else throws. */
export async function issuedTitle(
  asker: FicheAsker,
  contentId: number,
  productId: number,
): Promise<UndoRole> {
  if (await issuedAs(asker, contentId, productId, "film")) return "film";
  if (await issuedAs(asker, contentId, productId, "série")) return "série";
  throw new NotIssuedError();
}
