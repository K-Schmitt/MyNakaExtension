// The tab a title page call comes from, with the registry of what the worker issued to it, and the error
// every title page job throws, before any request, for a product it did not issue to that tab.

import type { FicheRegistry } from "./fiche-registry";

export type FicheAsker = { registry: FicheRegistry; tabId: number };

export class NotIssuedError extends Error {
  constructor() {
    super("fiche: product not issued to this tab");
  }
}
