// The SensCritique products the worker gave each Naka tab for the title page it shows. It is the gate of
// the title page's writes: a write names a product only this registry can vouch for, issued to that tab
// for that content by one of the worker's own answers. One title page per tab (the current one: another
// content forgets the previous), in memory only, at most MAX_FICHE_TABS tabs (the least recently issued
// goes first) and MAX_FICHE_PRODUCTS products per tab besides its title (the oldest goes first).

export const MAX_FICHE_TABS = 50;
export const MAX_FICHE_PRODUCTS = 2000;

export type FicheRegistry = {
  issue(tabId: number, contentId: number, productIds: readonly number[]): void;
  /** Issues the title's own product (the film or the series) and names it. */
  issueTitle(tabId: number, contentId: number, productId: number): void;
  /** The title's product issued to that tab for that content, if any. */
  titleOf(tabId: number, contentId: number): number | undefined;
  has(tabId: number, contentId: number, productId: number): boolean;
  drop(tabId: number): void;
};

type Page = { contentId: number; title?: number; products: Set<number> };

function trim(products: Set<number>): void {
  for (const id of products) {
    if (products.size <= MAX_FICHE_PRODUCTS) return;
    products.delete(id);
  }
}

export function createFicheRegistry(): FicheRegistry {
  const pages = new Map<number, Page>();

  // The tab's page for that content (a fresh one for another content), moved to the newest place.
  function pageFor(tabId: number, contentId: number): Page {
    const known = pages.get(tabId);
    const page =
      known?.contentId === contentId
        ? known
        : { contentId, products: new Set<number>() };
    pages.delete(tabId);
    pages.set(tabId, page);
    for (const oldest of pages.keys()) {
      if (pages.size <= MAX_FICHE_TABS) break;
      pages.delete(oldest);
    }
    return page;
  }

  function current(tabId: number, contentId: number): Page | undefined {
    const page = pages.get(tabId);
    return page?.contentId === contentId ? page : undefined;
  }

  return {
    issue(tabId, contentId, productIds) {
      const { products } = pageFor(tabId, contentId);
      for (const id of productIds) {
        products.delete(id);
        products.add(id);
      }
      trim(products);
    },
    issueTitle(tabId, contentId, productId) {
      pageFor(tabId, contentId).title = productId;
    },
    titleOf: (tabId, contentId) => current(tabId, contentId)?.title,
    has(tabId, contentId, productId) {
      const page = current(tabId, contentId);
      if (page === undefined) return false;
      return page.title === productId || page.products.has(productId);
    },
    drop(tabId) {
      pages.delete(tabId);
    },
  };
}
