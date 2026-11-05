import type { Removal } from "./list-diff";
import { findRemoval } from "./questions";
import type { ResolverPorts } from "./resolver";
import type { SyncState } from "./state";

export const MAX_TITLED_REMOVALS = 10;

export type TitledRemoval = Removal & { title?: string };

type DescribePorts = Pick<ResolverPorts, "describeNaka" | "describeSc">;

// The title of the side the removal is made from; a failed read leaves it out.
async function titleOf(
  removal: Removal,
  ports: DescribePorts,
): Promise<string | undefined> {
  try {
    const found =
      removal.removeFrom === "sc"
        ? await ports.describeSc(removal.pair.scId)
        : await ports.describeNaka(removal.pair.nakaId);
    return found?.title || undefined;
  } catch {
    return undefined;
  }
}

// Only a removal not stored yet is titled. The wishlist read is free; at most MAX_TITLED_REMOVALS Naka
// tab reads per pass.
export async function titleNewRemovals(
  state: SyncState,
  removals: readonly Removal[],
  ports: DescribePorts,
): Promise<TitledRemoval[]> {
  const result: TitledRemoval[] = [];
  let reads = 0;
  for (const removal of removals) {
    const isNew = !findRemoval(state, removal.removeFrom, removal.pair);
    const fromNaka = removal.removeFrom === "naka";
    if (!isNew || (fromNaka && reads >= MAX_TITLED_REMOVALS)) {
      result.push(removal);
      continue;
    }
    if (fromNaka) reads += 1;
    const title = await titleOf(removal, ports);
    result.push(title === undefined ? removal : { ...removal, title });
  }
  return result;
}
