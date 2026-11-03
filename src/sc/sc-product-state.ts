// Reads the owner's state on one product from a ProductCurrentUserInfos answer. Pure: no network.
//
// Only the two flags leave this module; the rating, the date seen, the user id and everything else in
// the answer are dropped here. An answer that does not describe the requested product, or whose flags
// are not booleans, fails closed with one fixed message (never a piece of the answer).

import { ScUnavailableError } from "./sc-errors";
import { type Envelope, isRecord } from "./sc-transport";

export type ProductState = { isDone: boolean; isWished: boolean };

const UNEXPECTED =
  "SensCritique ProductCurrentUserInfos: unexpected product state";

function unexpected(): ScUnavailableError {
  return new ScUnavailableError(UNEXPECTED);
}

function userInfosOf(
  { data }: Envelope,
  productId: number,
): Record<string, unknown> {
  const product = data.product;
  if (!isRecord(product) || product.id !== productId) throw unexpected();
  const infos = product.currentUserInfos;
  if (!isRecord(infos) || infos.productId !== productId) throw unexpected();
  return infos;
}

export function readProductState(
  envelope: Envelope,
  productId: number,
): ProductState {
  const { isDone, isWished } = userInfosOf(envelope, productId);
  if (typeof isDone !== "boolean" || typeof isWished !== "boolean") {
    throw unexpected();
  }
  return { isDone, isWished };
}
