// The SensCritique products the worker gave each Naka tab for the title page it shows. It is the gate of
// the title page's writes: a write names a product only this registry can vouch for, issued to that tab
// for that content by one of the worker's own answers. One title page per tab: `open` (a fiche-info
// answer) resets the tab, `issue` (a season answer) adds to its current page only. At most MAX_FICHE_TABS
// tabs (the least recently opened or issued goes first) and MAX_FICHE_PRODUCTS products per tab besides
// its title (the oldest goes first).
// It lives in chrome.storage.session under one key: memory only, it survives the MV3 worker's restarts,
// and content scripts cannot read it. Every operation runs after the previous one (one read, one write),
// so that two answers issued at once both stay.

import type { StorageArea } from "../ext/store";
import { type FichePage, parseFichePages } from "./fiche-registry-schema";

export const FICHE_REGISTRY_KEY = "ficheRegistry";
export const MAX_FICHE_TABS = 50;
export const MAX_FICHE_PRODUCTS = 2000;

export type FicheRegistry = {
  /** A new title page for the tab: what was issued to it before is forgotten. */
  open(
    tabId: number,
    contentId: number,
    title: number | undefined,
    productIds: readonly number[],
  ): Promise<void>;
  /** Adds to the tab's page for that content; nothing when the tab shows another content. */
  issue(
    tabId: number,
    contentId: number,
    productIds: readonly number[],
  ): Promise<void>;
  /** The title's product issued to that tab for that content, if any. */
  titleOf(tabId: number, contentId: number): Promise<number | undefined>;
  has(tabId: number, contentId: number, productId: number): Promise<boolean>;
  drop(tabId: number): Promise<void>;
};

function lastProducts(ids: readonly number[]): number[] {
  const unique = [...new Set([...ids].reverse())].reverse();
  return unique.slice(-MAX_FICHE_PRODUCTS);
}

// The page moved to the newest place, the oldest tabs beyond the bound dropped.
function placed(pages: readonly FichePage[], page: FichePage): FichePage[] {
  const others = pages.filter((known) => known.tabId !== page.tabId);
  return [...others, page].slice(-MAX_FICHE_TABS);
}

function pageOf(
  pages: readonly FichePage[],
  tabId: number,
  contentId: number,
): FichePage | undefined {
  return pages.find(
    (page) => page.tabId === tabId && page.contentId === contentId,
  );
}

function opened(
  tabId: number,
  contentId: number,
  title: number | undefined,
  productIds: readonly number[],
): FichePage {
  const page: FichePage = {
    tabId,
    contentId,
    products: lastProducts(productIds),
  };
  if (title !== undefined) page.title = title;
  return page;
}

export function createFicheRegistry(area: StorageArea): FicheRegistry {
  let last: Promise<unknown> = Promise.resolve();
  // One operation at a time; a failed one does not stop the next.
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = last.then(operation, operation);
    last = run.catch(() => undefined);
    return run;
  }
  async function load(): Promise<FichePage[]> {
    const stored = await area.get(FICHE_REGISTRY_KEY);
    return parseFichePages(stored[FICHE_REGISTRY_KEY]);
  }
  const save = (pages: FichePage[]) =>
    area.set({ [FICHE_REGISTRY_KEY]: pages });

  return {
    open: (tabId, contentId, title, productIds) =>
      serial(async () => {
        const page = opened(tabId, contentId, title, productIds);
        await save(placed(await load(), page));
      }),
    issue: (tabId, contentId, productIds) =>
      serial(async () => {
        const pages = await load();
        const page = pageOf(pages, tabId, contentId);
        if (page === undefined) return;
        const products = lastProducts([...page.products, ...productIds]);
        await save(placed(pages, { ...page, products }));
      }),
    titleOf: (tabId, contentId) =>
      serial(async () => pageOf(await load(), tabId, contentId)?.title),
    has: (tabId, contentId, productId) =>
      serial(async () => {
        const page = pageOf(await load(), tabId, contentId);
        if (page === undefined) return false;
        return page.title === productId || page.products.includes(productId);
      }),
    drop: (tabId) =>
      serial(async () => {
        const pages = await load();
        const kept = pages.filter((page) => page.tabId !== tabId);
        if (kept.length !== pages.length) await save(kept);
      }),
  };
}
