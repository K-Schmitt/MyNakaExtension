// The « Titres traités » list as the page shows it, from the worker's `handled-titles` answer. The answer
// comes from our own worker but is treated as untrusted: a malformed one hides the list. Never throws.
// Labels are remote catalogue text: the DOM writes them through textContent only.

import { asList, asRecord, asString } from "../ext/field-checks";
import { parseContentKey } from "../ext/item-schema";

export type HandledItem = { key: string; label: string };

export type HandledView =
  | { kind: "none" }
  | {
      kind: "list";
      heading: string;
      items: HandledItem[];
      waiting: HandledItem[];
    };

export const HANDLED_COPY = {
  forget: "Oublier",
  waiting: "en attente d'un onglet Naka",
  cancel: "Annuler",
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

/** The same view for these lines: none when both lists are empty; the heading counts the handled titles. */
export function viewOf(
  items: HandledItem[],
  waiting: HandledItem[],
): HandledView {
  if (items.length === 0 && waiting.length === 0) return NONE;
  return {
    kind: "list",
    heading: HANDLED_COPY.heading(items.length),
    items,
    waiting,
  };
}

// An answer without `waiting` (an older worker) reads as no waiting finish.
function parseWaiting(record: Record<string, unknown>): HandledItem[] {
  if (record.waiting === undefined) return [];
  return asList(record.waiting, "waiting", parseItem);
}

/** The keys the worker still cancels; an answer without the field, or a malformed one, reads as none. */
export function cancellingOf(raw: unknown): string[] {
  try {
    const record = asRecord(raw, "handled-titles");
    if (record.cancelling === undefined) return [];
    return asList(record.cancelling, "cancelling", (key, path) =>
      parseContentKey(key, path),
    );
  } catch {
    return [];
  }
}

export function toHandledView(raw: unknown): HandledView {
  try {
    const record = asRecord(raw, "handled-titles");
    const items = asList(record.titles, "titles", parseItem);
    return viewOf(items, parseWaiting(record));
  } catch {
    return NONE;
  }
}
