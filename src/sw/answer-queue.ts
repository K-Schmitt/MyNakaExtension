// The router's bound on answers to questions, like rate-queue: at most one WAITING job per question key.
// A newer message for a waiting key replaces the older one (the latest click wins) and adds no job. A
// running job no longer waits, so a message for its key queues behind it. The queue also knows, in memory
// only, which keys are still being answered (waiting or running): the read-only answers report them, since
// a read does not wait behind the queue and an answer may sit behind a sync for minutes. A restart loses it.

import type { QuestionKey } from "../core/questions";

export type AnswerQueue<M extends { key: QuestionKey }> = {
  (msg: M): void;
  /** The keys with an answer waiting or running. */
  answering(): QuestionKey[];
};

export function createAnswerQueue<M extends { key: QuestionKey }>(
  enqueue: (job: () => Promise<void>) => void,
  run: (msg: M) => Promise<void>,
): AnswerQueue<M> {
  const waiting = new Map<QuestionKey, M>();
  const running = new Set<QuestionKey>();
  const add: AnswerQueue<M> = (msg) => {
    const { key } = msg;
    if (waiting.has(key)) {
      waiting.set(key, msg);
      return;
    }
    waiting.set(key, msg);
    enqueue(async () => {
      const latest = waiting.get(key) ?? msg;
      waiting.delete(key);
      running.add(key);
      try {
        await run(latest);
      } finally {
        running.delete(key);
      }
    });
  };
  add.answering = () => [...new Set([...waiting.keys(), ...running.keys()])];
  return add;
}
