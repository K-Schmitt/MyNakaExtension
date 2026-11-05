// The router's bound on the forgets a Naka tab asks for. A naka.cx script can forge an unticked « vu » for
// every content id: at most one forget waits per content key, and at most MAX_QUEUED_FORGETS are queued or
// running; the rest is dropped. The hour's budget (forget-handled-job.ts) bounds what they may change.

import { contentKeyOf } from "../core/finish-event";
import type { ForgetHandledMessage } from "../ext/page-messages";

export const MAX_QUEUED_FORGETS = 20;

export type ForgetQueue = (msg: ForgetHandledMessage) => void;

export function createForgetQueue(
  enqueue: (job: () => Promise<void>) => void,
  run: (msg: ForgetHandledMessage) => Promise<void>,
): ForgetQueue {
  const waiting = new Set<string>();
  let active = 0;
  return (msg) => {
    const key = contentKeyOf(msg);
    if (waiting.has(key) || active >= MAX_QUEUED_FORGETS) return;
    waiting.add(key);
    active += 1;
    enqueue(async () => {
      waiting.delete(key);
      try {
        await run(msg);
      } finally {
        active -= 1;
      }
    });
  };
}
