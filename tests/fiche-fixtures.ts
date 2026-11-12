// The title page messages and SensCritique items of the fiche job tests.

import { emptyState, type SyncState } from "../src/core/state";
import type {
  FicheInfoMessage,
  FicheMineMessage,
  FicheSeasonMessage,
} from "../src/ext/fiche-messages";
import type { ScWishItem } from "../src/sc/wishlist-page";

export const TAB = 7;
export const OTHER_TAB = 8;

export const info = (
  over: Partial<FicheInfoMessage> = {},
): FicheInfoMessage => ({
  type: "fiche-info",
  contentId: 5,
  mediaType: "movie",
  title: "Solaris",
  ...over,
});

export const season = (
  over: Partial<FicheSeasonMessage> = {},
): FicheSeasonMessage => ({
  type: "fiche-season",
  contentId: 5,
  season: 2,
  ...over,
});

export const mine = (
  over: Partial<FicheMineMessage> = {},
): FicheMineMessage => ({
  type: "fiche-mine",
  contentId: 5,
  productId: 2005,
  ...over,
});

export const solaris = (productId: number, year: number): ScWishItem => ({
  productId,
  title: "Solaris",
  url: `/film/solaris/${productId}`,
  universe: 1,
  year,
});

export const linkedTo = (scId: number): SyncState => ({
  ...emptyState(),
  mapping: [{ nakaId: 5, scId }],
});
