// What a simulated run would have written, and what the next pass will write, as titles for the owner to
// check (spec §8quinquies). A title comes from the side that already holds it: SensCritique's own
// wishlist for an addition to Naka; for an addition to SensCritique, the product read the simulated write
// already made (its label), else Naka's catalogue through the run's describe cache. A title that cannot be
// read is empty, so the list still counts every write.

import type { Pair } from "../core/list-diff";
import { MAX_WRITES_PER_RUN, type Write } from "../core/sync-writes";
import type { Titled } from "../core/title-match";
import type { PreviewItem } from "../ext/settings";
import type { Describe, PlannedWrite } from "./sync-ports";

export type { PreviewItem } from "../ext/settings";

function pairOf(write: PlannedWrite, added: readonly Pair[]): Pair | undefined {
  return added.find((pair) =>
    write.side === "naka" ? pair.nakaId === write.id : pair.scId === write.id,
  );
}

function itemOf(side: PreviewItem["side"], titled?: Titled): PreviewItem {
  return {
    side,
    title: titled?.title ?? "",
    ...(titled?.year === undefined ? {} : { year: titled.year }),
    ...(titled === undefined ? {} : { type: titled.type }),
  };
}

// The title a write is about, read from the other side (its Naka title for an addition to SensCritique).
async function readTitled(
  side: PreviewItem["side"],
  pair: Pair,
  describe: Describe,
): Promise<Titled | undefined> {
  try {
    return side === "naka"
      ? await describe.sc(pair.scId)
      : await describe.naka(pair.nakaId);
  } catch {
    return undefined;
  }
}

function labelled(write: PlannedWrite): PreviewItem | undefined {
  if (write.side !== "sc" || write.label === undefined) return undefined;
  const { title, year } = write.label;
  return {
    side: "sc",
    title,
    ...(year === undefined ? {} : { year }),
    ...(write.type === undefined ? {} : { type: write.type }),
  };
}

async function previewItem(
  write: PlannedWrite,
  added: readonly Pair[],
  describe: Describe,
): Promise<PreviewItem> {
  const known = labelled(write);
  if (known !== undefined) return known;
  const pair = pairOf(write, added);
  if (pair === undefined) return itemOf(write.side);
  return itemOf(write.side, await readTitled(write.side, pair, describe));
}

export async function previewOf(
  planned: readonly PlannedWrite[],
  added: readonly Pair[],
  describe: Describe,
): Promise<PreviewItem[]> {
  const items: PreviewItem[] = [];
  for (const write of planned) {
    items.push(await previewItem(write, added, describe));
  }
  return items;
}

// The next pass's writes: the first MAX_WRITES_PER_RUN deferred ones, in order.
export async function nextOf(
  deferred: readonly Write[],
  describe: Describe,
): Promise<PreviewItem[]> {
  const items: PreviewItem[] = [];
  for (const write of deferred.slice(0, MAX_WRITES_PER_RUN)) {
    const titled = await readTitled(write.side, write.pair, describe);
    items.push(itemOf(write.side, titled));
  }
  return items;
}
