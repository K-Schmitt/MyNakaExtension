// The worker's jobs, as the router queues them. A job never rejects: it records its own failure where
// it can. A failure it cannot record (the settings unreadable, the store down) leaves storage as it was:
// overwriting unreadable settings would drop the binding.

import type { FinishedMessage } from "../content/playback-tracker";
import type {
  DismissRatingMessage,
  RateMessage,
  RatingCardMessage,
} from "../ext/rating-messages";
import type { Mode } from "../ext/settings";
import type { Store } from "../ext/store";
import { finishJob } from "./finish-job";
import type { JobDeps } from "./job-deps";
import {
  answerCard,
  answerCards,
  type CardAnswer,
  type CardsAnswer,
} from "./rating-answers";
import { dismissJob, rateJob } from "./rating-jobs";
import { type StatusSnapshot, statusSnapshot } from "./status-snapshot";
import { syncJob, type Trigger } from "./sync-job";

export type { JobDeps } from "./job-deps";
export type { StatusSnapshot } from "./status-snapshot";
export type { Trigger } from "./sync-job";

export type Jobs = {
  syncJob(trigger: Trigger): Promise<void>;
  finishJob(msg: FinishedMessage): Promise<void>;
  setMode(mode: Mode): Promise<void>;
  rate(msg: RateMessage): Promise<void>;
  dismissRating(msg: DismissRatingMessage): Promise<void>;
  /** No job: read-only, answered outside the queue (Ruling 20). */
  statusSnapshot(): Promise<StatusSnapshot>;
  /** No job either: read-only, rejects when the store cannot be read. */
  ratingCard(msg: RatingCardMessage): Promise<CardAnswer>;
  ratingCards(): Promise<CardsAnswer>;
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
    rate: (msg) => quietly(() => rateJob(deps, msg)),
    dismissRating: (msg) => quietly(() => dismissJob(deps.store, msg)),
    statusSnapshot: () => statusSnapshot(deps.store),
    ratingCard: (msg) => answerCard(deps.store, msg),
    ratingCards: () => answerCards(deps.store),
  };
}
