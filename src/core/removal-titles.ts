import type { Removal } from "./list-diff";
import { findRemoval } from "./questions";
import type { ResolverPorts } from "./resolver";
import type { SyncState } from "./state";
import type { TitleImage } from "./title-image";

export const MAX_TITLED_REMOVALS = 10;

export type TitledRemoval = Removal & {
  title?: string;
  image?: TitleImage;
};

type DescribePorts = Pick<ResolverPorts, "describeNaka" | "describeSc">;

type Described = { title: string; image?: TitleImage };

// The title and image of the side the removal is made from, one read; a failed read leaves them out.
async function describedOf(
  removal: Removal,
  ports: DescribePorts,
): Promise<Described | undefined> {
  try {
    const found =
      removal.removeFrom === "sc"
        ? await ports.describeSc(removal.pair.scId)
        : await ports.describeNaka(removal.pair.nakaId);
    if (!found?.title) return undefined;
    return {
      title: found.title,
      ...(found.image === undefined ? {} : { image: found.image }),
    };
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
    const described = await describedOf(removal, ports);
    result.push(
      described === undefined ? removal : { ...removal, ...described },
    );
  }
  return result;
}
