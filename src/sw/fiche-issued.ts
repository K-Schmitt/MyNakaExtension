// The gate of every title page write: the product must be one the worker issued to the asking tab for
// that content, as what the write names (fiche-roles). A registry that cannot be read counts as not
// issued. Throws before any request.

import type { FicheAsker } from "./fiche-info-job";
import { NotIssuedError } from "./fiche-mine-job";
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
