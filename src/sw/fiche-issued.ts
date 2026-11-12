// The gate of every title page write: the product must be one the worker issued to the asking tab for
// that content. A registry that cannot be read counts as not issued. Throws before any request.

import type { FicheAsker } from "./fiche-info-job";
import { NotIssuedError } from "./fiche-mine-job";

async function issued(
  { registry, tabId }: FicheAsker,
  contentId: number,
  productId: number,
): Promise<boolean> {
  try {
    return await registry.has(tabId, contentId, productId);
  } catch {
    return false;
  }
}

export async function assertIssued(
  asker: FicheAsker,
  contentId: number,
  productId: number,
): Promise<void> {
  if (!(await issued(asker, contentId, productId))) throw new NotIssuedError();
}
