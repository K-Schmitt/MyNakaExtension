// Where the home row goes. Pure: the list is described by indices among its element children.

/** Indices among the list's element children (-1 when absent); `age`: ms since this list node was first seen. */
export type ListSnapshot = { reprendre: number; host: number; age: number };

/** Naka adds « Reprendre » about 330 ms after a first titled row; past this, it is not coming. */
export const REPRENDRE_WAIT_MS = 1000;

export type RowMove = "keep" | "wait" | "after-reprendre" | "top";

export function rowMove(list: ListSnapshot): RowMove {
  if (list.reprendre >= 0) {
    return list.host === list.reprendre + 1 ? "keep" : "after-reprendre";
  }
  if (list.host === 0) return "keep";
  return list.age < REPRENDRE_WAIT_MS ? "wait" : "top";
}
