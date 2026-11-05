// What the worker answers to `open-questions`, `removal-offer` and `page-lists`, and what a `rating-card`
// of a title with no card adds. Read-only: it loads, it never saves. The answers hold stored questions,
// titles, ids and one stored outcome record, so no token and no error text can be in them. An unreadable
// state rejects: the router then answers `undefined` rather than an invented answer.

import { listedOnBothAtLastRun } from "../core/listed-on-both";
import {
  findRemoval,
  openAmbiguity,
  type QuestionKey,
} from "../core/questions";
import { type SyncState, samePair } from "../core/state";
import type { LastAnswer } from "../ext/answer-record";
import type { Settings } from "../ext/settings";
import type { Store } from "../ext/store";
import { pageItems } from "./page-items";
import {
  type AmbiguityOffer,
  ambiguityOffer,
  isOffered,
  type OpenQuestionsAnswer,
  type PageListsAnswer,
  type RemovalOfferAnswer,
  removalQuestion,
} from "./question-offers";

export type * from "./question-offers";

export type QuestionsReader = Pick<Store, "loadSettings" | "loadState">;

const MAX_OPEN_QUESTIONS = 20;

type Shared = { answering?: QuestionKey[]; lastAnswer?: LastAnswer };

function sharedOf(settings: Settings, answering: QuestionKey[]): Shared {
  return {
    ...(answering.length === 0 ? {} : { answering }),
    ...(settings.lastAnswer === undefined
      ? {}
      : { lastAnswer: settings.lastAnswer }),
  };
}

// The home panel: removals first, then the ambiguities, in stored order; the dismissed, legacy and
// « none » questions are the page's only (D15).
function openQuestionsOf(state: SyncState): OpenQuestionsAnswer["questions"] {
  const removals = state.pending.flatMap((item) =>
    item.kind === "removal" && !item.asked ? [removalQuestion(item)] : [],
  );
  const ambiguities = state.pending.flatMap((item) =>
    item.kind === "ambiguity" && item.asked !== true && isOffered(item)
      ? [ambiguityOffer(item)]
      : [],
  );
  return [...removals, ...ambiguities].slice(0, MAX_OPEN_QUESTIONS);
}

export async function answerOpenQuestions(
  store: QuestionsReader,
  answering: QuestionKey[],
): Promise<OpenQuestionsAnswer> {
  const settings = await store.loadSettings();
  const state = await store.loadState();
  return {
    questions: openQuestionsOf(state),
    ...sharedOf(settings, answering),
  };
}

export async function answerPageLists(
  store: QuestionsReader,
  answering: QuestionKey[],
): Promise<PageListsAnswer> {
  const settings = await store.loadSettings();
  const state = await store.loadState();
  return { ...pageItems(state), ...sharedOf(settings, answering) };
}

// The removal of the pair from SensCritique, offered after the owner removed the title on Naka. Never for
// a pair that was not listed on both sides at the last run: a forged event must not show a block.
function removalOfferOf(state: SyncState, contentId: number) {
  const pair = state.mapping.find((mapped) => mapped.nakaId === contentId);
  if (pair === undefined) return undefined;
  const stored = findRemoval(state, "sc", pair);
  const settled = state.settled.some((held) => samePair(held, pair));
  if (settled || findRemoval(state, "naka", pair) !== undefined)
    return undefined;
  if (stored === undefined && !listedOnBothAtLastRun(state, pair)) {
    return undefined;
  }
  return stored === undefined
    ? removalQuestion({ kind: "removal", removeFrom: "sc", pair, asked: false })
    : removalQuestion(stored);
}

export async function answerRemovalOffer(
  store: QuestionsReader,
  contentId: number,
  answering: QuestionKey[],
): Promise<RemovalOfferAnswer> {
  const settings = await store.loadSettings();
  const offer = removalOfferOf(await store.loadState(), contentId);
  const { lastAnswer } = settings;
  return {
    offer: offer ?? null,
    ...(offer !== undefined && answering.includes(offer.key)
      ? { answering: true as const }
      : {}),
    ...(lastAnswer?.target.startsWith(`removal:sc:${contentId}:`)
      ? { lastAnswer }
      : {}),
  };
}

/** What a rating-card answer adds for a title with no card: its question, and the outcome of its answer. */
export async function cardQuestion(
  store: Pick<Store, "loadState">,
  settings: Settings,
  contentId: number,
): Promise<{ question?: AmbiguityOffer; lastAnswer?: LastAnswer }> {
  const { lastAnswer } = settings;
  const own =
    lastAnswer?.target === `ambiguity:naka:${contentId}` ? { lastAnswer } : {};
  try {
    const found = openAmbiguity(await store.loadState(), "naka", contentId);
    return found && isOffered(found)
      ? { ...own, question: ambiguityOffer(found) }
      : own;
  } catch {
    return own; // an unreadable state gives no question; the rest of the answer is unchanged
  }
}
