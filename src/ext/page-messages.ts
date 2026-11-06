// The status-page family of messages. « Oublier les comptes liés » and « Réinitialiser » are local: the
// worker queues each as a job that touches storage only, never a site, and answers `{ ok: true }` at once.
// `forget-handled` also comes from a Naka tab (an unticked « vu »), and `handled-titles` is a read.

import type { ContentIds } from "../core/finish-event";
import { asId } from "./field-checks";
import type { SenderRole } from "./messages";
import { playbackContext } from "./playback-context";

export type PageMessage =
  | { type: "forget-binding" }
  | { type: "reset" }
  | ({ type: "forget-handled" } & ContentIds)
  | ({ type: "cancel-retry" } & ContentIds)
  | { type: "handled-titles" };

export type PageType = PageMessage["type"];
export type ForgetHandledMessage = Extract<
  PageMessage,
  { type: "forget-handled" }
>;
export type CancelRetryMessage = Extract<PageMessage, { type: "cancel-retry" }>;

/** Spread into the worker's type list (messages.ts). */
export const PAGE_TYPE_FLAGS: Record<PageType, true> = {
  "forget-binding": true,
  reset: true,
  "forget-handled": true,
  "cancel-retry": true,
  "handled-titles": true,
};

export const PAGE_SENDERS: Record<PageType, readonly SenderRole[]> = {
  "forget-binding": ["status-page"],
  reset: ["status-page"],
  "forget-handled": ["naka-tab", "status-page"],
  "cancel-retry": ["status-page"],
  "handled-titles": ["status-page"],
};

export function isPageType(type: string): type is PageType {
  return Object.hasOwn(PAGE_TYPE_FLAGS, type);
}

export function parsePageMessage(
  type: PageType,
  record: Record<string, unknown>,
): PageMessage {
  if (type !== "forget-handled" && type !== "cancel-retry") return { type };
  return {
    type,
    contentId: asId(record.contentId, "contentId"),
    ...playbackContext(record),
  };
}
