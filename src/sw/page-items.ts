// What the status page lists, and what its count line counts: one function, so that they never disagree.
// The questions of the page are every stored question (the dismissed ones hidden, the ones saved before
// 4b legacy), except a « none » ambiguity: it is listed with the unlinked titles, so no row shows twice
// (D3, D15). The unlinked titles are those still present at the last completed run (D16).

import { linkKey } from "../core/questions";
import type { PendingItem, SyncState, UnlinkedItem } from "../core/state";
import {
  ambiguityOffer,
  isOffered,
  type PageQuestion,
  removalQuestion,
  type UnlinkedOffer,
} from "./question-offers";

export const MAX_PAGE_QUESTIONS = 50;
export const MAX_PAGE_UNLINKED = 200;

export type PageItems = {
  questions: PageQuestion[];
  unlinked: UnlinkedOffer[];
};

function pageQuestionOf(item: PendingItem): PageQuestion[] {
  if (item.kind === "removal") {
    return [{ ...removalQuestion(item), hidden: item.asked }];
  }
  if (item.candidates === undefined) {
    return [
      {
        kind: "legacy",
        key: `ambiguity:${item.side}:${item.id}`,
        side: item.side,
        id: item.id,
      },
    ];
  }
  if (!isOffered(item)) return [];
  return [{ ...ambiguityOffer(item), hidden: item.asked === true }];
}

function presentAtLastRun(state: SyncState, item: UnlinkedItem): boolean {
  return state.presence[item.side].some(
    (entry) => entry.id === item.id && entry.to === state.run,
  );
}

function unlinkedOffers(state: SyncState): UnlinkedOffer[] {
  const listed = state.unlinked
    .filter((item) => presentAtLastRun(state, item))
    .map(({ side, id, title, reason }) => ({
      key: linkKey(side, id),
      side,
      id,
      title,
      reason,
    }));
  const none = state.pending.flatMap((item): UnlinkedOffer[] =>
    item.kind === "ambiguity" && item.candidates?.length === 0
      ? [
          {
            key: linkKey(item.side, item.id),
            side: item.side,
            id: item.id,
            title: item.title ?? "",
            reason: "none-chosen",
          },
        ]
      : [],
  );
  return [...listed, ...none];
}

export function pageItems(state: SyncState): PageItems {
  return {
    questions: state.pending
      .flatMap(pageQuestionOf)
      .slice(0, MAX_PAGE_QUESTIONS),
    unlinked: unlinkedOffers(state).slice(0, MAX_PAGE_UNLINKED),
  };
}
