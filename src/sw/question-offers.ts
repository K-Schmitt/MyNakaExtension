// The questions as the worker offers them to the Naka tab and the status page.

import type { Pair } from "../core/list-diff";
import {
  type AmbiguityItem,
  type QuestionKey,
  questionKey,
  type RemovalItem,
} from "../core/questions";
import type { QuestionCandidate, Side, UnlinkedItem } from "../core/state";
import type { LastAnswer } from "../ext/answer-record";

export type AmbiguityOffer = {
  kind: "ambiguity";
  key: QuestionKey;
  side: Side;
  id: number;
  title: string;
  candidates: QuestionCandidate[];
};
export type RemovalOffer = {
  kind: "removal";
  key: QuestionKey;
  removeFrom: Side;
  pair: Pair;
  title: string;
};
export type QuestionOffer = AmbiguityOffer | RemovalOffer;
export type PageQuestion =
  | (QuestionOffer & { hidden: boolean })
  | { kind: "legacy"; key: QuestionKey; side: Side; id: number };
export type UnlinkedOffer = {
  key: QuestionKey;
  side: Side;
  id: number;
  title: string;
  reason: UnlinkedItem["reason"] | "none-chosen";
};
export type OpenQuestionsAnswer = {
  questions: QuestionOffer[];
  answering?: QuestionKey[];
  lastAnswer?: LastAnswer;
};
export type PageListsAnswer = {
  questions: PageQuestion[];
  unlinked: UnlinkedOffer[];
  answering?: QuestionKey[];
  lastAnswer?: LastAnswer;
};
export type RemovalOfferAnswer = {
  offer: RemovalOffer | null;
  answering?: true;
  lastAnswer?: LastAnswer;
};

type AmbiguityWithCandidates = AmbiguityItem & {
  candidates: QuestionCandidate[];
};

/** An ambiguity that can be answered from the stored data: it has candidates (none: « none », absent: legacy). */
export function isOffered(
  item: AmbiguityItem,
): item is AmbiguityWithCandidates {
  return item.candidates !== undefined && item.candidates.length > 0;
}

export function ambiguityOffer(item: AmbiguityWithCandidates): AmbiguityOffer {
  return {
    kind: "ambiguity",
    key: questionKey(item),
    side: item.side,
    id: item.id,
    title: item.title ?? "",
    candidates: item.candidates,
  };
}

export function removalQuestion(item: RemovalItem): RemovalOffer {
  return {
    kind: "removal",
    key: questionKey(item),
    removeFrom: item.removeFrom,
    pair: item.pair,
    title: item.title ?? "",
  };
}
