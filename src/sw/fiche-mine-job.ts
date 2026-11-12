// The owner's own rating of one product of the title page (fiche-mine): only a product issued to the
// asking tab for that content; any other is refused before any request. One read through the SC limiter.

import type { MineAnswer } from "../ext/fiche-answers";
import type { FicheMineMessage } from "../ext/fiche-messages";
import type { FicheAsker } from "./fiche-info-job";
import type { JobDeps } from "./job-deps";

export class NotIssuedError extends Error {
  constructor() {
    super("fiche: product not issued to this tab");
  }
}

export async function ficheMineJob(
  deps: JobDeps,
  asker: FicheAsker,
  msg: FicheMineMessage,
): Promise<MineAnswer> {
  const { registry, tabId } = asker;
  if (!registry.has(tabId, msg.contentId, msg.productId)) {
    throw new NotIssuedError();
  }
  const state = await deps.limiters.sc.run(() =>
    deps.sc.productState(msg.productId),
  );
  return { mine: state.rating };
}
