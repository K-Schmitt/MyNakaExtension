// Reads the owner's state on one product from a ProductCurrentUserInfos answer. Pure: no network.
//
// Only the two flags and the product's universe (public, non-personal: film, series, episode…) leave
// this module; the rating, the date seen, the user id and everything else in the answer are dropped
// here. An answer that does not describe the requested product, whose flags are not booleans or whose
// universe is not a safe integer, fails closed with one fixed message (never a piece of the answer).

import { ScUnavailableError } from "./sc-errors";
import { type Envelope, isRecord } from "./sc-transport";

export type ProductState = {
  isDone: boolean;
  isWished: boolean;
  universe: number;
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

export function readProductState(
  envelope: Envelope,
  productId: number,
): ProductState {
  const product = productOf(envelope, productId);
  const { isDone, isWished } = userInfosOf(product, productId);
  if (typeof isDone !== "boolean" || typeof isWished !== "boolean") {
    throw unexpected();
  }
  return { isDone, isWished, universe: universeOf(product) };
}
