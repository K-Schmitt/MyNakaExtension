// The handled titles the status page lists: each key with the words that name it.

import { type ContentIds, idsOfKey } from "./finish-event";
import { cardFor, type RatingCard } from "./rating-cards";
import { type RetryFinish, retriesOf } from "./retry-finishes";
import type { SyncState } from "./state";

export type HandledTitle = { key: string; label: string };

const NO_BREAK_SPACE = "\u00a0";

const unknownTitle = (contentId: number): string =>
  `Contenu Naka n°${NO_BREAK_SPACE}${contentId}`;

function withPlace({ season, episode }: ContentIds, title: string): string {
  if (season === undefined || episode === undefined) return title;
  return `${title} · saison ${season}, épisode ${episode}`;
}

// The title stored at finish time, else the rating card's, else the Naka id.
function labelOf(
  state: SyncState,
  cards: readonly RatingCard[],
  key: string,
  ids: ContentIds,
): string {
  const title =
    state.handledTitles?.[key] ??
    cardFor([...cards], key)?.title ??
    unknownTitle(ids.contentId);
  return withPlace(ids, title);
}

function chosenTitle(entry: RetryFinish): string | undefined {
  return entry.question.candidates?.find((c) => c.id === entry.pair.scId)
    ?.title;
}

/** What names a waiting finish, before its Naka id: the question's title, the chosen candidate's, the card's
 * title. */
export function waitingTitleOf(
  entry: RetryFinish,
  cards: readonly RatingCard[],
): string | undefined {
  return (
    entry.question.title ??
    chosenTitle(entry) ??
    cardFor([...cards], entry.key)?.title
  );
}

/** The finishes that wait for a Naka tab, in stored order; the question's title names each. */
export function waitingTitles(
  state: SyncState,
  cards: readonly RatingCard[],
): HandledTitle[] {
  return retriesOf(state).flatMap((entry) => {
    const ids = idsOfKey(entry.key);
    if (ids === undefined || state.handled.includes(entry.key)) return [];
    const title = waitingTitleOf(entry, cards) ?? unknownTitle(ids.contentId);
    return [{ key: entry.key, label: withPlace(ids, title) }];
  });
}

/** Every handled key, most recent first, each with its label. */
export function handledTitles(
  state: SyncState,
  cards: readonly RatingCard[],
): HandledTitle[] {
  return [...state.handled].reverse().flatMap((key) => {
    const ids = idsOfKey(key);
    return ids === undefined
      ? []
      : [{ key, label: labelOf(state, cards, key, ids) }];
  });
}
