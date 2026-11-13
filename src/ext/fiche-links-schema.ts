// Display-only links of the title pages: a Naka content id (decimal string) to a SensCritique product id.
// They never feed state.mapping. Throws a StoredStateError holding the field path, never the value.

import { asId, asRecord, fail } from "./field-checks";

export type FicheLinks = Record<string, number>;

export const MAX_FICHE_LINKS = 500;

const CONTENT_ID = /^[1-9][0-9]*$/;

export function parseFicheLinks(raw: unknown): FicheLinks {
  if (raw === undefined) return {};
  const record = asRecord(raw, "ficheLinks");
  const keys = Object.keys(record);
  if (keys.length > MAX_FICHE_LINKS) return fail("ficheLinks");
  const links: FicheLinks = {};
  for (const key of keys) {
    if (!CONTENT_ID.test(key)) return fail("ficheLinks");
    links[key] = asId(record[key], `ficheLinks.${key}`);
  }
  return links;
}
