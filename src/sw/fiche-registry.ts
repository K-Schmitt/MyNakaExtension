// The SensCritique products the worker gave each Naka tab for the title page it shows. It is the gate of
// the title page's writes: a write names a product only this registry can vouch for, issued to that tab
// for that content by one of the worker's own answers, as what the write names (fiche-roles). One title
// page per tab: `open` (a fiche-info answer: the title, or the candidates of a choice) resets the tab,
// `issue` (a season answer: its episodes) and `offer` (a search answer: its candidates) add to its current
// page only. At most MAX_FICHE_TABS tabs (the least recently opened, issued or offered to goes first) and
// MAX_FICHE_PRODUCTS candidates, and as many episodes, per tab (the oldest goes first).
// It lives in chrome.storage.session under one key: memory only, it survives the MV3 worker's restarts,
// and content scripts cannot read it. Every operation runs after the previous one (one read, one write),
// so that two answers issued at once both stay.

import type { StorageArea } from "../ext/store";
import {
  type FichePage,
  type FicheTitle,
  parseFichePages,
} from "./fiche-registry-schema";
import { type FicheRole, isIssued, standsFor } from "./fiche-roles";

export const FICHE_REGISTRY_KEY = "ficheRegistry";
export const MAX_FICHE_TABS = 50;
export const MAX_FICHE_PRODUCTS = 2000;

export type FicheRegistry = {
  /** A new title page for the tab: what was issued to it before is forgotten. */
  open(
    tabId: number,
    contentId: number,
    title: FicheTitle | undefined,
    candidates: readonly number[],
  ): Promise<void>;
  /** Adds episodes to the tab's page for that content; nothing when the tab shows another content. */
  issue(
    tabId: number,
    contentId: number,
    episodes: readonly number[],
  ): Promise<void>;
  /** Adds candidates to the tab's page for that content; nothing when the tab shows another content. */
  offer(
    tabId: number,
    contentId: number,
    candidates: readonly number[],
  ): Promise<void>;
  /** The tab's page is that content's. */
  shows(tabId: number, contentId: number): Promise<boolean>;
  /** The title's product issued to that tab for that content, if any. */
  titleOf(tabId: number, contentId: number): Promise<FicheTitle | undefined>;
  /** Issued to that tab for that content, whatever it stands for (a read). */
  has(tabId: number, contentId: number, productId: number): Promise<boolean>;
  /** Issued to that tab for that content as `role` (a write). */
  issuedAs(
    tabId: number,
    contentId: number,
    productId: number,
    role: FicheRole,
  ): Promise<boolean>;
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
  title: FicheTitle | undefined,
  candidates: readonly number[],
): FichePage {
  const page: FichePage = {
    tabId,
    contentId,
    candidates: lastProducts(candidates),
    episodes: [],
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
    open: (tabId, contentId, title, candidates) =>
      serial(async () => {
        const page = opened(tabId, contentId, title, candidates);
        await save(placed(await load(), page));
      }),
    issue: (tabId, contentId, episodes) =>
      serial(async () => {
        const pages = await load();
        const page = pageOf(pages, tabId, contentId);
        if (page === undefined) return;
        const all = lastProducts([...page.episodes, ...episodes]);
        await save(placed(pages, { ...page, episodes: all }));
      }),
    offer: (tabId, contentId, candidates) =>
      serial(async () => {
        const pages = await load();
        const page = pageOf(pages, tabId, contentId);
        if (page === undefined) return;
        const all = lastProducts([...page.candidates, ...candidates]);
        await save(placed(pages, { ...page, candidates: all }));
      }),
    shows: (tabId, contentId) =>
      serial(async () => pageOf(await load(), tabId, contentId) !== undefined),
    titleOf: (tabId, contentId) =>
      serial(async () => pageOf(await load(), tabId, contentId)?.title),
    has: (tabId, contentId, productId) =>
      serial(async () => {
        const page = pageOf(await load(), tabId, contentId);
        return page !== undefined && isIssued(page, productId);
      }),
    issuedAs: (tabId, contentId, productId, role) =>
      serial(async () => {
        const page = pageOf(await load(), tabId, contentId);
        return page !== undefined && standsFor(page, productId, role);
      }),
  };
}
