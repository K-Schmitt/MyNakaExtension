// The stored form of the fiche registry (chrome.storage.session): one entry per tab, least recently
// issued first, each product kept under what it stands for. The area holds only what the worker wrote,
// but a value it cannot read is no list of products: it reads as an empty registry, so nothing is issued
// by an unreadable value. The earlier form (one `products` list, no roles) is such a value.

import type { MediaType } from "../core/title-match";
import {
  asId,
  asList,
  asOneOf,
  asRecord,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "../ext/field-checks";

/** The title's own product and what Naka's content is: a film or a series. */
export type FicheTitle = { productId: number; type: MediaType };

export type FichePage = {
  tabId: number;
  contentId: number;
  /** The title's own product (the film or the series), when the answer named one. */
  title?: FicheTitle;
  /** The products of a choice the answer offered. */
  candidates: number[];
  /** The episode products of the seasons read. */
  episodes: number[];
};

const PAGE_KEYS = valuesOf<keyof FichePage>({
  tabId: true,
  contentId: true,
  title: true,
  candidates: true,
  episodes: true,
});
const TITLE_KEYS = valuesOf<keyof FicheTitle>({ productId: true, type: true });
const TITLE_TYPES = valuesOf<MediaType>({ film: true, serie: true });

function parseTitle(raw: unknown): FicheTitle {
  const record = asRecord(raw, "title");
  onlyKeys(record, TITLE_KEYS, "title");
  return {
    productId: asId(record.productId, "title.productId"),
    type: asOneOf(record.type, TITLE_TYPES, "title.type"),
  };
}

function parsePage(raw: unknown, path: string): FichePage {
  const record = asRecord(raw, path);
  onlyKeys(record, PAGE_KEYS, path);
  const page: FichePage = {
    tabId: asId(record.tabId, `${path}.tabId`),
    contentId: asId(record.contentId, `${path}.contentId`),
    candidates: asList(record.candidates, `${path}.candidates`, asId),
    episodes: asList(record.episodes, `${path}.episodes`, asId),
  };
  const title = whenPresent(record.title, parseTitle);
  if (title !== undefined) page.title = title;
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
