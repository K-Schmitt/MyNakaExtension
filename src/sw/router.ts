// Every chrome.runtime message is untrusted. Ruling 8: the router parses it, then checks who sent it,
// then whether that sender may send that type, and ignores (never answers) anything that fails a step.
// Every job of the worker then runs on ONE queue, one at a time; only `status` is answered.

import {
  allowedFor,
  isTrustedSender,
  parseToWorker,
  type Sender,
  type ToWorker,
} from "../ext/messages";
import { createDebounce } from "./debounce";
import { createFinishQueue } from "./finish-queue";
import type { JobQueue } from "./job-queue";
import type { Jobs } from "./jobs";
import type { Timer } from "./naka-proxy";
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
};

function ignore(): void {}

export function createRouter(deps: RouterDeps): Router {
  const { queue, jobs } = deps;
  const debounce = createDebounce(deps.timer, PLAYLIST_DEBOUNCE_MS);
  // A job records its own failure; a rejection here could not even be recorded.
  const enqueue = (job: () => Promise<void>): void => {
    queue.run(job).catch(ignore);
  };
  const finish = createFinishQueue(enqueue, (msg) => jobs.finishJob(msg));

  function dispatch(msg: ToWorker, respond: Respond): boolean {
    switch (msg.type) {
      case "naka-ready":
        enqueue(() => jobs.syncJob("naka-ready"));
        return false;
      case "playlist-changed":
        debounce(() => enqueue(() => jobs.syncJob("playlist")));
        return false;
      case "resync":
        enqueue(() => jobs.syncJob("button"));
        return false;
      case "finished":
        finish(msg);
        return false;
      case "set-mode":
        enqueue(() => jobs.setMode(msg.mode));
        return false;
      case "status":
        // Chrome's responder may throw (its port already closed): that is no error of the worker.
        queue
          .run(() => jobs.statusSnapshot())
          .then(respond)
          .catch(ignore);
        return true;
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
