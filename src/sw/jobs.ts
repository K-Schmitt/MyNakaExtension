// The worker's jobs, as the router queues them. A job never rejects: it records its own failure where
// it can. A failure it cannot record (the settings unreadable, the store down) leaves storage as it was:
// overwriting unreadable settings would drop the binding.

import type { FinishedMessage } from "../content/playback-tracker";
import type { QuestionKey } from "../core/questions";
import type { Thresholds } from "../core/watch-trigger";
import type { ForgetHandledMessage } from "../ext/page-messages";
import type {
  AnswerQuestionMessage,
  AnswerRemovalMessage,
  HideQuestionMessage,
  LinkTitleMessage,
  RequeueQuestionMessage,
  SearchTitlesMessage,
} from "../ext/question-messages";
import type {
  DismissRatingMessage,
  RateMessage,
  RatingCardMessage,
} from "../ext/rating-messages";
import type { Mode } from "../ext/settings";
import type { Store } from "../ext/store";
import { answerQuestionJob, hideQuestionJob } from "./answer-jobs";
import { finishJob } from "./finish-job";
import { forgetFromTabJob, forgetHandledJob } from "./forget-handled-job";
import {
  answerHandledTitles,
  type HandledTitlesAnswer,
} from "./handled-titles-answer";
import type { JobDeps } from "./job-deps";
import { linkTitleJob, requeueJob } from "./link-job";
import {
  answerOpenQuestions,
  answerPageLists,
  answerRemovalOffer,
  type OpenQuestionsAnswer,
  type PageListsAnswer,
  type RemovalOfferAnswer,
} from "./question-answers";
import {
  answerCard,
  answerCards,
  type CardAnswer,
  type CardsAnswer,
} from "./rating-answers";
import { dismissJob, rateJob } from "./rating-jobs";
import { answerRemovalJob } from "./removal-job";
import { forgetJob, resetJob } from "./reset-jobs";
import { settingsJob } from "./settings-job";
import { type StatusSnapshot, statusSnapshot } from "./status-snapshot";
import { syncJob, type Trigger } from "./sync-job";
import { answerSearch, type SearchAnswer } from "./title-search";

export type { JobDeps } from "./job-deps";
export type { StatusSnapshot } from "./status-snapshot";
export type { Trigger } from "./sync-job";

export type Jobs = {
  syncJob(trigger: Trigger): Promise<void>;
  finishJob(msg: FinishedMessage): Promise<void>;
  setMode(mode: Mode): Promise<void>;
  setSettings(thresholds: Thresholds, pauseFromPercent: number): Promise<void>;
  rate(msg: RateMessage): Promise<void>;
  dismissRating(msg: DismissRatingMessage): Promise<void>;
  /** The owner's answers: each verifies against the stored state, then records its outcome. */
  answerQuestion(msg: AnswerQuestionMessage): Promise<void>;
  answerRemoval(msg: AnswerRemovalMessage): Promise<void>;
  hideQuestion(msg: HideQuestionMessage): Promise<void>;
  /** B6: the link by hand, and the question asked again. */
  linkTitle(msg: LinkTitleMessage): Promise<void>;
  requeueQuestion(msg: RequeueQuestionMessage): Promise<void>;
  /** The page's local actions: storage only, never a site. */
  forget(): Promise<void>;
  reset(): Promise<void>;
  /** B8b: a handled title forgotten (an unticked « vu », or the page's « Oublier »): storage only. */
  forgetHandled(msg: ForgetHandledMessage): Promise<void>;
  /** The handled titles for the page: read-only, answered outside the queue. */
  handledTitles(): Promise<HandledTitlesAnswer>;
  /** The same, asked by a Naka tab: counted against the hour's budget of forgets. */
  forgetHandledFromTab(msg: ForgetHandledMessage): Promise<void>;
  /** No job: read-only, answered outside the queue (Ruling 20). */
  statusSnapshot(): Promise<StatusSnapshot>;
  /** No job either: read-only, rejects when the store cannot be read. */
  ratingCard(msg: RatingCardMessage): Promise<CardAnswer>;
  ratingCards(): Promise<CardsAnswer>;
  /** The question reads: read-only too, and they reject when the state cannot be read. */
  openQuestions(answering: QuestionKey[]): Promise<OpenQuestionsAnswer>;
  removalOffer(
    contentId: number,
    answering: QuestionKey[],
  ): Promise<RemovalOfferAnswer>;
  pageLists(answering: QuestionKey[]): Promise<PageListsAnswer>;
  /** A search on the other site: read-only, never rejects (a failure is an answer with its code). */
  searchTitles(msg: SearchTitlesMessage): Promise<SearchAnswer>;
};

async function quietly(job: () => Promise<void>): Promise<void> {
  try {
    await job();
  } catch {
    // Nothing more can be recorded: see the header.
  }
}

async function setMode(store: Store, mode: Mode): Promise<void> {
  const settings = await store.loadSettings();
  if (settings.mode === mode) return;
  await store.saveSettings({ ...settings, mode });
}

export function createJobs(deps: JobDeps): Jobs {
  return {
    syncJob: (trigger) => quietly(() => syncJob(deps, trigger)),
    finishJob: (msg) => quietly(() => finishJob(deps, msg)),
    setMode: (mode) => quietly(() => setMode(deps.store, mode)),
    setSettings: (thresholds, pause) =>
      quietly(() => settingsJob(deps.store, thresholds, pause)),
    rate: (msg) => quietly(() => rateJob(deps, msg)),
    dismissRating: (msg) => quietly(() => dismissJob(deps.store, msg)),
    answerQuestion: (msg) => quietly(() => answerQuestionJob(deps, msg)),
    answerRemoval: (msg) => quietly(() => answerRemovalJob(deps, msg)),
    hideQuestion: (msg) => quietly(() => hideQuestionJob(deps.store, msg)),
    linkTitle: (msg) => quietly(() => linkTitleJob(deps, msg)),
    requeueQuestion: (msg) => quietly(() => requeueJob(deps, msg)),
    forget: () => quietly(() => forgetJob(deps.store)),
    reset: () => quietly(() => resetJob(deps.store)),
    forgetHandled: (msg) => quietly(() => forgetHandledJob(deps.store, msg)),
    forgetHandledFromTab: (msg) =>
      quietly(() => forgetFromTabJob(deps.store, deps.now, msg)),
    handledTitles: () => answerHandledTitles(deps.store),
    searchTitles: (msg) => answerSearch(deps, msg),
    statusSnapshot: () => statusSnapshot(deps.store),
    ratingCard: (msg) => answerCard(deps.store, msg),
    ratingCards: () => answerCards(deps.store),
    openQuestions: (answering) => answerOpenQuestions(deps.store, answering),
    removalOffer: (contentId, answering) =>
      answerRemovalOffer(deps.store, contentId, answering),
    pageLists: (answering) => answerPageLists(deps.store, answering),
  };
}
