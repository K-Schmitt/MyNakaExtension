// What the worker answers to `handled-titles`: every handled key with its label. Read-only: it loads,
// it never saves; an unreadable store rejects and the router answers `undefined`.

import { type HandledTitle, handledTitles } from "../core/handled-titles";
import type { Store } from "../ext/store";

export type HandledTitlesAnswer = { titles: HandledTitle[] };

export async function answerHandledTitles(
  store: Pick<Store, "loadState" | "loadRatings">,
): Promise<HandledTitlesAnswer> {
  const state = await store.loadState();
  return { titles: handledTitles(state, await store.loadRatings()) };
}
