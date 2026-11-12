// One SensCritique product as the title page shows it: its public average, the owner's own rating and
// SensCritique's own title and year (so the block shows what a star will rate), read once through the SC
// limiter (an authenticated read, never a write). undefined when the product is of another universe than
// the title (a film's page shows no series): such a product is never shown, nor issued.

import { universeType } from "../core/adapt-titles";
import type { MediaType } from "../core/title-match";
import type { FicheProduct } from "../ext/fiche-answers";
import { MAX_TEXT } from "../ext/fiche-page-events";
import type { ProductLabel } from "../sc/product-label";
import type { JobDeps } from "./job-deps";

function capped(label: ProductLabel): ProductLabel {
  return { ...label, title: label.title.slice(0, MAX_TEXT) };
}

export async function readFicheProduct(
  deps: JobDeps,
  productId: number,
  type: MediaType,
): Promise<FicheProduct | undefined> {
  const state = await deps.limiters.sc.run(() =>
    deps.sc.productState(productId),
  );
  if (universeType(state.universe) !== type) return undefined;
  const product: FicheProduct = {
    id: productId,
    average: state.average,
    mine: state.rating,
  };
  if (state.label !== undefined) product.label = capped(state.label);
  return product;
}
