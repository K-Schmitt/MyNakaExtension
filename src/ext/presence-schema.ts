import type { Presence, PresenceEntry } from "../core/presence";
import { asId, asInt, asList, asRecord, fail, onlyKeys } from "./field-checks";

function parseEntry(raw: unknown, path: string, run: number): PresenceEntry {
  const record = asRecord(raw, path);
  onlyKeys(record, ["id", "from", "to"], path);
  const id = asId(record.id, `${path}.id`);
  const from = asInt(record.from, 1, `${path}.from`);
  const to = asInt(record.to, from, `${path}.to`);
  if (to > run) return fail(`${path}.to`);
  return { id, from, to };
}

// One side. Per id, the entries come in run order and are disjoint: each starts after the previous one
// ended. Entries of different ids may interleave in any order.
function parseSide(raw: unknown, path: string, run: number): PresenceEntry[] {
  const lastEnd = new Map<number, number>();
  return asList(raw, path, (item, itemPath) => {
    const entry = parseEntry(item, itemPath, run);
    const previous = lastEnd.get(entry.id);
    if (previous !== undefined && entry.from <= previous) {
      return fail(`${itemPath}.from`);
    }
    lastEnd.set(entry.id, entry.to);
    return entry;
  });
}

export function parsePresence(
  raw: unknown,
  path: string,
  run: number,
): Presence {
  const record = asRecord(raw, path);
  onlyKeys(record, ["naka", "sc"], path);
  return {
    naka: parseSide(record.naka, `${path}.naka`, run),
    sc: parseSide(record.sc, `${path}.sc`, run),
  };
}
