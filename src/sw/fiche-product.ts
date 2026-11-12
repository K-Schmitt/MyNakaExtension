// One SensCritique product as the title page shows it: its public average and the owner's own rating,
// read once through the SC limiter (an authenticated read, never a write).

import type { FicheProduct } from "../ext/fiche-answers";
import type { JobDeps } from "./job-deps";

export async function readFicheProduct(
  deps: JobDeps,
  productId: number,
): Promise<FicheProduct> {
  const state = await deps.limiters.sc.run(() =>
    deps.sc.productState(productId),
  );
  return { id: productId, average: state.average, mine: state.rating };
}
