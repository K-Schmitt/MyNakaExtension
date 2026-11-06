// « Annuler » on a waiting finish: the answer behind it is undone and the question asked again. Storage
// only. An unknown key (the retry ran first and succeeded) changes nothing and saves nothing.

import { contentKeyOf } from "../core/finish-event";
import { cancelRetry } from "../core/retry-finishes";
import type { CancelRetryMessage } from "../ext/page-messages";
import type { Store } from "../ext/store";

export async function cancelRetryJob(
  store: Pick<Store, "loadState" | "saveState">,
  msg: CancelRetryMessage,
): Promise<void> {
  const cancelled = cancelRetry(await store.loadState(), contentKeyOf(msg));
  if (cancelled !== undefined) await store.saveState(cancelled);
}
