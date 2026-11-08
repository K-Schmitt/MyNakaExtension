// Keeps the home row in place: Naka rebuilds its list on every return to the home page, so the
// placement is decided again on every change, through ports the DOM binding fills in.

import type { EndTimer } from "./end-poll";
import { type ListSnapshot, REPRENDRE_WAIT_MS, rowMove } from "./row-place";

export type KeeperPorts = {
  snapshot(): ListSnapshot | undefined;
  apply(move: "after-reprendre" | "top"): void;
  detach(): void;
  watch(onChange: () => void): () => void;
  timer: EndTimer;
};

export function createRowKeeper(ports: KeeperPorts): {
  start(): void;
  stop(): void;
} {
  let stopWatching: (() => void) | undefined;
  let pending: unknown;
  let hasPending = false;
  let stopped = true;

  const cancelWait = (): void => {
    if (hasPending) ports.timer.clear(pending);
    hasPending = false;
  };

  const check = (): void => {
    if (stopped) return;
    cancelWait();
    const list = ports.snapshot();
    if (list === undefined) return;
    const move = rowMove(list);
    if (move === "keep") return;
    if (move === "wait") {
      pending = ports.timer.set(
        check,
        Math.max(0, REPRENDRE_WAIT_MS - list.age),
      );
      hasPending = true;
      return;
    }
    ports.apply(move);
  };

  return {
    start(): void {
      if (!stopped) return;
      stopped = false;
      stopWatching = ports.watch(check);
      check();
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      cancelWait();
      stopWatching?.();
      stopWatching = undefined;
      ports.detach();
    },
  };
}
