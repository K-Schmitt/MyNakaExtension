// Reads the owner's state on one product from a ProductCurrentUserInfos answer. Pure: no network.
//
// Only the two flags, the product's universe (public, non-personal: film, series, episode…), the owner's
// own rating (currentUserInfos.rating, to be shown back to the owner) and the series' season count leave
// this module; the date seen, the user id and everything else in the answer are dropped here. The
// product-level `rating` is the community average and is never read. An answer that does not describe the
// requested product, whose flags are not booleans, whose universe is not a safe integer, whose rating is
// neither null nor an integer 1 to 10 (the key must be present) or whose season count is not a positive
// safe integer (absent or null is fine) fails closed with one fixed message (never a piece of the answer).
// The requested product with a null currentUserInfos is how SensCritique answers a token it does not
// recognize: that is ScUnauthenticatedError, so the owner is told to log in again.

import { ScUnauthenticatedError, ScUnavailableError } from "./sc-errors";
import { type Envelope, isRecord } from "./sc-transport";

export type ProductState = {
  isDone: boolean;
  isWished: boolean;
  universe: number;
  rating: number | null;
  numberOfSeasons?: number;
};

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

function seasonCountOf(product: Record<string, unknown>): {
  numberOfSeasons?: number;
} {
  const { numberOfSeasons } = product;
  if (numberOfSeasons === undefined || numberOfSeasons === null) return {};
  if (typeof numberOfSeasons !== "number") throw unexpected();
  if (!Number.isSafeInteger(numberOfSeasons) || numberOfSeasons < 1) {
    throw unexpected();
  }
  return { numberOfSeasons };
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
  return {
    isDone,
    isWished,
    universe: universeOf(product),
    rating: ratingOf(infos),
    ...seasonCountOf(product),
  };
}
