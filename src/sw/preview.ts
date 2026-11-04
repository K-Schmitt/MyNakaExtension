// What a simulated run would have written, as titles for the owner to check (spec §8quinquies). A title
// comes from the run's describe caches, from the side that already holds the title: SensCritique's own
// wishlist for an addition to Naka, Naka's catalogue for an addition to SensCritique. A title that
// cannot be read is empty, so the preview still counts every planned write.

import type { Pair } from "../core/list-diff";
import type { Titled } from "../core/title-match";
import type { RunRecord } from "../ext/settings";
import type { Describe, PlannedWrite } from "./sync-ports";

export type PreviewItem = NonNullable<RunRecord["preview"]>[number];

function pairOf(write: PlannedWrite, added: readonly Pair[]): Pair | undefined {
  return added.find((pair) =>
    write.side === "naka" ? pair.nakaId === write.id : pair.scId === write.id,
  );
}

async function titleOf(
  write: PlannedWrite,
  added: readonly Pair[],
  describe: Describe,
): Promise<string> {
  const pair = pairOf(write, added);
  if (pair === undefined) return "";
  let titled: Titled | undefined;
  try {
    titled =
      write.side === "naka"
        ? await describe.sc(pair.scId)
        : await describe.naka(pair.nakaId);
  } catch {
    return "";
  }
  return titled?.title ?? "";
}

export async function previewOf(
  planned: readonly PlannedWrite[],
  added: readonly Pair[],
  describe: Describe,
): Promise<PreviewItem[]> {
  const items: PreviewItem[] = [];
  for (const write of planned) {
    items.push({
      side: write.side,
      title: await titleOf(write, added, describe),
    });
  }
  return items;
}
