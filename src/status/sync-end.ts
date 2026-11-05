// Tells when the work the status view showed has ended: the page then asks its lists again. Only ready
// views count; a loading or silent one says nothing about the engine.

import type { StatusView } from "./status-view";

export type SyncEnd = {
  see(view: StatusView): void;
};

export function createSyncEnd(onEnd: () => void): SyncEnd {
  let wasInProgress = false;
  return {
    see(view) {
      if (view.kind !== "ready") return;
      const ended = wasInProgress && !view.inProgress;
      wasInProgress = view.inProgress;
      if (ended) onEnd();
    },
  };
}
