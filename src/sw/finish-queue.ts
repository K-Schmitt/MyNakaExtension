// The router's bound on finishes. A page script can send a `finished` for every content id:
// at most one finish waits per content key, and at most MAX_QUEUED_FINISHES are queued or running. The
// rest is dropped, unrecorded. A newer message for a waiting key replaces it when its progress is at
// least as high (the 0.9 mark arriving while the 0.85 one waits must not be lost). A running job no
// longer waits, so a message for its key queues behind it.

import type { FinishedMessage } from "../content/playback-tracker";
import { contentKeyOf } from "../core/finish-event";

export const MAX_QUEUED_FINISHES = 20;

export type FinishQueue = (msg: FinishedMessage) => void;

export function createFinishQueue(
  enqueue: (job: () => Promise<void>) => void,
  run: (msg: FinishedMessage) => Promise<void>,
): FinishQueue {
  const waiting = new Map<string, FinishedMessage>();
  let active = 0;
  return (msg) => {
    const key = contentKeyOf(msg);
    const queued = waiting.get(key);
    if (queued !== undefined) {
      if (msg.progress >= queued.progress) waiting.set(key, msg);
      return;
    }
    if (active >= MAX_QUEUED_FINISHES) return;
    waiting.set(key, msg);
    active += 1;
    enqueue(async () => {
      const latest = waiting.get(key) ?? msg;
      waiting.delete(key);
      try {
        await run(latest);
      } finally {
        active -= 1;
      }
    });
  };
}
