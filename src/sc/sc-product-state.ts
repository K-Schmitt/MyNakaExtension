// Reads the owner's state on one product from a ProductCurrentUserInfos answer. Pure: no network.
//
// Only the two flags, the product's universe (public, non-personal: film, series, episode…), the
// owner's own rating (currentUserInfos.rating, to be shown back to the owner), the product's public average and, now, the product's
// public title and year (the label, read leniently by product-label.ts, for the preview) leave this module, with what
// an undo restores: the date seen (kept to put « vu » back as it was), whether the owner reviewed or recommended the
// title (an undo never drops those) and the product's page; the user id, the season count (Naka's is the one used, Ruling 11) and everything else in the answer
// are dropped here. The product-level `rating` is the public average, read leniently by average-rating.ts (null when unreadable, it never fails the answer). An answer that
// does not describe the requested product, whose flags are not booleans, whose universe is not a safe
// integer or whose rating is neither null nor an integer 1 to 10 (the key must be present) fails closed
// with one fixed message (never a piece of the answer).
// The requested product with a null currentUserInfos is how SensCritique answers a token it does not
// recognize: that is ScUnauthenticatedError, so the owner is told to log in again.

import { readAverage } from "./average-rating";
import { type ProductLabel, readProductLabel } from "./product-label";
import { ScUnauthenticatedError, ScUnavailableError } from "./sc-errors";
import { type Envelope, isRecord } from "./sc-transport";

export type ProductState = {
  isDone: boolean;
  isWished: boolean;
  universe: number;
  rating: number | null;
  /** The product's public average (0 to 10, one decimal), null when absent or unreadable. */
  average: number | null;
  /** The product's public title and year, for the preview only; absent when the answer does not give them. */
  label?: ProductLabel;
  /** The date seen, YYYY-MM-DD only; null for any other value or shape. */
  dateDone: string | null;
  isReviewed: boolean;
  isRecommended: boolean;
  /** The product's page on SensCritique, absolute; undefined unless the path has the known shape. */
  url: string | undefined;
};

const SC_ORIGIN = "https://www.senscritique.com";
const DATE_DONE = /^\d{4}-\d{2}-\d{2}$/;
const PRODUCT_PATH = /^\/[a-z_]+\/[A-Za-z0-9_-]+\/\d+(\/S\d+)?$/;

const UNEXPECTED =
  "SensCritique ProductCurrentUserInfos: unexpected product state";

function unexpected(): ScUnavailableError {
  return new ScUnavailableError(UNEXPECTED);
}

function productOf(
  { data }: Envelope,
  productId: number,
): Record<string, unknown> {
  const product = data.product;
  if (!isRecord(product) || product.id !== productId) throw unexpected();
  return product;
}

function userInfosOf(
  product: Record<string, unknown>,
  productId: number,
): Record<string, unknown> {
  const infos = product.currentUserInfos;
  if (infos === null) throw new ScUnauthenticatedError();
  if (!isRecord(infos) || infos.productId !== productId) throw unexpected();
  return infos;
}

function universeOf(product: Record<string, unknown>): number {
  const { universe } = product;
  if (typeof universe !== "number" || !Number.isSafeInteger(universe)) {
    throw unexpected();
  }
  return universe;
}

function ratingOf(infos: Record<string, unknown>): number | null {
  const { rating } = infos;
  if (rating === null) return null;
  if (typeof rating !== "number" || !Number.isInteger(rating)) {
    throw unexpected();
  }
  if (rating < 1 || rating > 10) throw unexpected();
  return rating;
}

function dateDoneOf(infos: Record<string, unknown>): string | null {
  const { dateDone } = infos;
  return typeof dateDone === "string" && DATE_DONE.test(dateDone)
    ? dateDone
    : null;
}

function urlOf(product: Record<string, unknown>): string | undefined {
  const { url } = product;
  return typeof url === "string" && PRODUCT_PATH.test(url)
    ? `${SC_ORIGIN}${url}`
    : undefined;
}

export function readProductState(
  envelope: Envelope,
  productId: number,
): ProductState {
  const product = productOf(envelope, productId);
  const infos = userInfosOf(product, productId);
  const { isDone, isWished } = infos;
  if (typeof isDone !== "boolean" || typeof isWished !== "boolean") {
    throw unexpected();
  }
  const label = readProductLabel(product);
  return {
    isDone,
    isWished,
    universe: universeOf(product),
    rating: ratingOf(infos),
    average: readAverage(product),
    dateDone: dateDoneOf(infos),
    isReviewed: infos.isReviewed === true,
    isRecommended: infos.isRecommended === true,
    url: urlOf(product),
    ...(label === undefined ? {} : { label }),
  };
}
