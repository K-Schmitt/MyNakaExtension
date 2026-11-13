// The SensCritique product a Naka content is already linked to: the sync's mapping first, then the
// display-only links of the title pages. Unreadable display links count as none (they only spare a search).

import type { FicheLinks } from "../ext/fiche-links-schema";
import type { Store } from "../ext/store";

async function displayLinks(store: Store): Promise<FicheLinks> {
  try {
    return await store.loadFicheLinks();
  } catch {
    return {};
  }
}

export async function linkedProduct(
  store: Store,
  contentId: number,
): Promise<number | undefined> {
  const state = await store.loadState();
  const pair = state.mapping.find((mapped) => mapped.nakaId === contentId);
  if (pair !== undefined) return pair.scId;
  return (await displayLinks(store))[String(contentId)];
}
