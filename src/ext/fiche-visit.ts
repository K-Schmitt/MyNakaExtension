// The tab's announcement of a title page visit, posted from the isolated world to the page's window for
// the MAIN relay, which then posts again the title page events the tab may have missed. It carries the
// tab's path only, never a token. The page can post it too: it only makes the relay repeat events the
// page itself could forge.

import { asRecord, asString, fail, onlyKeys, valuesOf } from "./field-checks";

export const VISIT_TYPE = "mynaka/fiche-visit";
export const MAX_VISIT_PATH = 64;

export type FicheVisit = { type: typeof VISIT_TYPE; path: string };

const VISIT_KEYS = valuesOf<keyof FicheVisit>({ type: true, path: true });

export function visitMessage(path: string): FicheVisit {
  return { type: VISIT_TYPE, path };
}

function visitPath(raw: unknown): string {
  const record = asRecord(raw, "visit");
  onlyKeys(record, VISIT_KEYS, "visit");
  if (record.type !== VISIT_TYPE) return fail("type");
  const path = asString(record.path, "path");
  return path.length <= MAX_VISIT_PATH ? path : fail("path");
}

/** The announced path, or undefined for anything else. */
export function parseVisit(raw: unknown): string | undefined {
  try {
    return visitPath(raw);
  } catch {
    return undefined;
  }
}
