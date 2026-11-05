// The status-page family of messages. « Oublier les comptes liés » and « Réinitialiser » are local: the
// worker queues each as a job that touches storage only, never a site, and answers `{ ok: true }` at once.

import type { SenderRole } from "./messages";

export type PageMessage = { type: "forget-binding" } | { type: "reset" };

export type PageType = PageMessage["type"];

/** Spread into the worker's type list (messages.ts). */
export const PAGE_TYPE_FLAGS: Record<PageType, true> = {
  "forget-binding": true,
  reset: true,
};

export const PAGE_SENDERS: Record<PageType, readonly SenderRole[]> = {
  "forget-binding": ["status-page"],
  reset: ["status-page"],
};
