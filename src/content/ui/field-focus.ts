// The search field across a redraw of the actions host: the build hands back the field it made, and when
// the old field had the focus (the owner was typing, or pressed Enter), the new one gets it back, caret at
// the end, so a search or its answer does not leave the owner's keys to Naka's page.

import type { ElementLike, ShadowRootLike } from "./dom-like";

export type FieldLike = ElementLike & {
  value: string;
  setSelectionRange(start: number, end: number): void;
};

/** Where a build of the actions puts the search field it made, if any. */
export type FieldSlot = { field?: FieldLike };

export function hasFocus(
  root: ShadowRootLike,
  field: FieldLike | undefined,
): boolean {
  return field !== undefined && root.activeElement === field;
}

export function focusAtEnd(field: FieldLike): void {
  field.focus();
  const end = field.value.length;
  field.setSelectionRange(end, end);
}
