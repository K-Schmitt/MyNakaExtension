// What the worker answers to `handled-titles`: every handled key with its label. Read-only: it loads,
// it never saves; an unreadable store rejects and the router answers `undefined`.

import {
  type HandledTitle,
  handledTitles,
  waitingTitles,
} from "../core/handled-titles";
import type { Store } from "../ext/store";

export type HandledTitlesAnswer = {
  titles: HandledTitle[];
  waiting: HandledTitle[];
};

export async function answerHandledTitles(
  store: Pick<Store, "loadState" | "loadRatings">,
  cancelling: readonly string[],
): Promise<HandledTitlesAnswer> {
  const state = await store.loadState();
  const cards = await store.loadRatings();
  return {
    titles: handledTitles(state, cards),
    // P3: a cancel still queued already took the line away on the page; a reload must not bring it back.
    waiting: waitingTitles(state, cards).filter(
      (t) => !cancelling.includes(t.key),
    ),
  };
}
