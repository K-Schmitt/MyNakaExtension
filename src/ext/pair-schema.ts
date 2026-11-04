import type { Pair } from "../core/list-diff";
import { asId, asList, asRecord, fail, onlyKeys } from "./field-checks";

export function parsePair(raw: unknown, path: string): Pair {
  const record = asRecord(raw, path);
  onlyKeys(record, ["nakaId", "scId"], path);
  return {
    nakaId: asId(record.nakaId, `${path}.nakaId`),
    scId: asId(record.scId, `${path}.scId`),
  };
}

export function parsePairs(raw: unknown, path: string): Pair[] {
  return asList(raw, path, parsePair);
}

// The mapping is 1:1: no naka id and no sc id appears twice.
export function parseMapping(raw: unknown, path: string): Pair[] {
  const nakaIds = new Set<number>();
  const scIds = new Set<number>();
  return asList(raw, path, (item, itemPath) => {
    const pair = parsePair(item, itemPath);
    if (nakaIds.has(pair.nakaId)) return fail(`${itemPath}.nakaId`);
    if (scIds.has(pair.scId)) return fail(`${itemPath}.scId`);
    nakaIds.add(pair.nakaId);
    scIds.add(pair.scId);
    return pair;
  });
}
