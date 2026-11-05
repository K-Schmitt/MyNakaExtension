// The « Titres traités » list as the page shows it, from the worker's `handled-titles` answer. The answer
// comes from our own worker but is treated as untrusted: a malformed one hides the list. Never throws.
// Labels are remote catalogue text: the DOM writes them through textContent only.

import { asList, asRecord, asString } from "../ext/field-checks";
import { parseContentKey } from "../ext/item-schema";

export type HandledItem = { key: string; label: string };

export type HandledView =
  | { kind: "none" }
  | { kind: "list"; heading: string; items: HandledItem[] };

export const HANDLED_COPY = {
  forget: "Oublier",
  heading: (count: number): string => `Titres traités (${count})`,
};

const NONE: HandledView = { kind: "none" };

function parseItem(raw: unknown, path: string): HandledItem {
  const record = asRecord(raw, path);
  return {
    key: parseContentKey(record.key, path),
    label: asString(record.label, path),
  };
}

/** The same view for these items: none when the list is empty. */
export function viewOf(items: HandledItem[]): HandledView {
  if (items.length === 0) return NONE;
  return { kind: "list", heading: HANDLED_COPY.heading(items.length), items };
}

export function toHandledView(raw: unknown): HandledView {
  try {
    const items = asList(
      asRecord(raw, "handled-titles").titles,
      "titles",
      parseItem,
    );
    return viewOf(items);
  } catch {
    return NONE;
  }
}
