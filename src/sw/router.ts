// Every chrome.runtime message is untrusted. Ruling 8: the router parses it, then checks who sent it,
// then whether that sender may send that type, and ignores (never answers) anything that fails a step.
// Every job of the worker then runs on ONE queue, one at a time. `status`, the only message answered, is
// no job (Ruling 20): it is answered at once, outside the queue, from a read-only snapshot and the
// activity kept here. `set-mode` and `set-settings` stay queued: a sync saves the settings it loaded. `rating-card` and
// `rating-cards` are answered the same way (read-only); `rate` and `dismiss-rating` are queued jobs.

import {
  allowedFor,
  isTrustedSender,
  parseToWorker,
  type Sender,
  type ToWorker,
} from "../ext/messages";
import { createActivity, overlapping } from "./activity";
import { createDebounce } from "./debounce";
import { createFinishQueue } from "./finish-queue";
import type { JobQueue } from "./job-queue";
import type { Jobs, Trigger } from "./jobs";
import type { Timer } from "./naka-proxy";
import { createRateQueue } from "./rate-queue";
import type { CardAnswer, CardsAnswer } from "./rating-answers";
import { sendingOf } from "./rating-answers";
import { PLAYLIST_DEBOUNCE_MS } from "./run-throttle";

export type Respond = (answer: unknown) => void;

export type Router = {
  /** true when `respond` will be called later (Chrome keeps the channel open). */
  handle(raw: unknown, sender: Sender, respond: Respond): boolean;
};

export type RouterDeps = {
  extensionId: string;
  queue: JobQueue;
  jobs: Jobs;
  /** The debounce of "Ma liste" changes. */
  timer: Timer;
  /** When a job starts, for the status answer. */
  now(): number;
};

function ignore(): void {}

export function createRouter(deps: RouterDeps): Router {
  const { queue, jobs } = deps;
  const debounce = createDebounce(deps.timer, PLAYLIST_DEBOUNCE_MS);
  const activity = createActivity(deps.now);
  // A job records its own failure; a rejection here could not even be recorded.
  const enqueue = (job: () => Promise<void>): void => {
    queue.run(job).catch(ignore);
  };
  const sync = (trigger: Trigger) =>
    enqueue(activity.track("sync", () => jobs.syncJob(trigger)));
  const rate = createRateQueue(enqueue, (msg) => jobs.rate(msg));
  const finish = createFinishQueue(
    (job) => enqueue(activity.track("finish", job)),
    (msg) => jobs.finishJob(msg),
  );

  // The answers add what the queue alone knows: the ratings still being sent.
  const withSending = async (cardAnswer: Promise<CardAnswer>) => {
    const answer = await cardAnswer;
    return answer.card
      ? { ...answer, ...sendingOf(answer.card, rate.sending) }
      : answer;
  };
  const withSendingAll = async (cardsAnswer: Promise<CardsAnswer>) => ({
    cards: (await cardsAnswer).cards.map((entry) => ({
      ...entry,
      ...sendingOf(entry.card, rate.sending),
    })),
  });

  // Chrome's responder may throw (its port already closed): that is no error of the worker.
  function answerStatus(respond: Respond): void {
    const before = activity.current();
    jobs
      .statusSnapshot()
      .then((snapshot) =>
        respond({ ...snapshot, ...overlapping(before, activity.current()) }),
      )
      .catch(ignore);
  }

  // A read of the stored ratings: outside the queue, never saving. An unreadable store gives no answer.
  function answerRead(read: () => Promise<unknown>, respond: Respond): void {
    read()
      .then((answer) => respond(answer))
      .catch(ignore);
  }

  function dispatch(msg: ToWorker, respond: Respond): boolean {
    switch (msg.type) {
      case "naka-ready":
        sync("naka-ready");
        return false;
      case "playlist-changed":
        debounce(() => sync("playlist"));
        return false;
      case "resync":
        sync("button");
        return false;
      case "finished":
        finish(msg);
        return false;
      case "set-mode":
        enqueue(activity.queueMode(msg.mode, () => jobs.setMode(msg.mode)));
        return false;
      case "set-settings":
        enqueue(() => jobs.setSettings(msg.thresholds, msg.pauseFromPercent));
        return false;
      case "status":
        answerStatus(respond);
        return true;
      case "rating-card":
        answerRead(() => withSending(jobs.ratingCard(msg)), respond);
        return true;
      case "rating-cards":
        answerRead(() => withSendingAll(jobs.ratingCards()), respond);
        return true;
      case "rate":
        rate(msg);
        return false;
      case "dismiss-rating":
        enqueue(() => jobs.dismissRating(msg));
        return false;
    }
  }

  return {
    handle(raw, sender, respond) {
      const msg = parseToWorker(raw);
      if (msg === undefined) return false;
      const role = isTrustedSender(sender, deps.extensionId);
      if (role === undefined || !allowedFor(role, msg)) return false;
      return dispatch(msg, respond);
    },
  };
}
