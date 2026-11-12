// The stored form of the fiche registry (chrome.storage.session): one entry per tab, least recently
// issued first. The area holds only what the worker wrote, but a value it cannot read is no list of
// products: it reads as an empty registry, so nothing is issued by an unreadable value.

import {
  asId,
  asList,
  asRecord,
  onlyKeys,
  valuesOf,
} from "../ext/field-checks";

export type FichePage = {
  tabId: number;
  contentId: number;
  /** The title's own product (the film or the series), when the answer named one. */
  title?: number;
  products: number[];
};

const PAGE_KEYS = valuesOf<keyof FichePage>({
  tabId: true,
  contentId: true,
  title: true,
  products: true,
});

function parsePage(raw: unknown, path: string): FichePage {
  const record = asRecord(raw, path);
  onlyKeys(record, PAGE_KEYS, path);
  const page: FichePage = {
    tabId: asId(record.tabId, `${path}.tabId`),
    contentId: asId(record.contentId, `${path}.contentId`),
    products: asList(record.products, `${path}.products`, asId),
  };
  if (record.title !== undefined) page.title = asId(record.title, path);
  return page;
}

export function parseFichePages(raw: unknown): FichePage[] {
  if (raw === undefined) return [];
  try {
    return asList(raw, "ficheRegistry", parsePage);
  } catch {
    return [];
  }
}
