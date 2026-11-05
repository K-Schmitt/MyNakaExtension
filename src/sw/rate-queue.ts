// The router's bound on ratings, like finish-queue: at most one WAITING rate job per (content key, label).
// A newer rate for a waiting title and label replaces its rating (the latest click wins) and adds no job.
// A running job no longer waits, so a message for its title and label queues behind it.

import { contentKeyOf } from "../core/finish-event";
import type { RateMessage } from "../ext/rating-messages";

export type RateQueue = (msg: RateMessage) => void;

export function createRateQueue(
  enqueue: (job: () => Promise<void>) => void,
  run: (msg: RateMessage) => Promise<void>,
): RateQueue {
  const waiting = new Map<string, RateMessage>();
  return (msg) => {
    const id = `${contentKeyOf(msg)}|${msg.label}`;
    if (waiting.has(id)) {
      waiting.set(id, msg);
      return;
    }
    waiting.set(id, msg);
    enqueue(async () => {
      const latest = waiting.get(id) ?? msg;
      waiting.delete(id);
      await run(latest);
    });
  };
}
