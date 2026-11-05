// The router's bound on ratings, like finish-queue: at most one WAITING rate job per (content key, label).
// A newer rate for a waiting title and label replaces its rating (the latest click wins) and adds no job.
// A running job no longer waits, so a message for its title and label queues behind it.
// The queue also knows, in memory only, which ratings are still being sent (waiting or running): the
// read-only answers report them, since a read does not wait behind the queue. A worker restart loses it.

import { contentKeyOf } from "../core/finish-event";
import type { RatingLabel } from "../core/rating-cards";
import type { RateMessage } from "../ext/rating-messages";

export type RateQueue = {
  (msg: RateMessage): void;
  /** The labels of this content key with a rate waiting or running. */
  sending(key: string): RatingLabel[];
};

const idOf = (msg: RateMessage): string => `${contentKeyOf(msg)}|${msg.label}`;

export function createRateQueue(
  enqueue: (job: () => Promise<void>) => void,
  run: (msg: RateMessage) => Promise<void>,
): RateQueue {
  const waiting = new Map<string, RateMessage>();
  const running = new Map<string, RateMessage>();
  const add: RateQueue = (msg) => {
    const id = idOf(msg);
    if (waiting.has(id)) {
      waiting.set(id, msg);
      return;
    }
    waiting.set(id, msg);
    enqueue(async () => {
      const latest = waiting.get(id) ?? msg;
      waiting.delete(id);
      running.set(id, latest);
      try {
        await run(latest);
      } finally {
        running.delete(id);
      }
    });
  };
  add.sending = (key) => {
    const labels = [...waiting.values(), ...running.values()]
      .filter((msg) => contentKeyOf(msg) === key)
      .map((msg) => msg.label);
    return [...new Set(labels)];
  };
  return add;
}
