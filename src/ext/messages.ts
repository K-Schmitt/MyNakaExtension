// The messages exchanged between the extension's parts, and the parsers that guard each direction.
// Every message from another context is untrusted: a parser takes `unknown`, never throws, and returns a
// fresh object holding only the known keys (anything else, a token included, is dropped), or undefined.

import type { ContentIds } from "../core/finish-event";
import type { Thresholds } from "../core/watch-trigger";
import { checkQuery } from "../naka/naka-input";
import {
  asId,
  asOneOf,
  asRecord,
  asString,
  fail,
  valuesOf,
} from "./field-checks";
import {
  isPageType,
  PAGE_SENDERS,
  PAGE_TYPE_FLAGS,
  type PageMessage,
  parsePageMessage,
} from "./page-messages";
import { playbackContext, playlistEvent } from "./playback-context";
import {
  isQuestionType,
  parseQuestionMessage,
  QUESTION_SENDERS,
  QUESTION_TYPE_FLAGS,
  type QuestionMessage,
} from "./question-messages";
import {
  isRatingType,
  parseRatingMessage,
  type RatingMessage,
} from "./rating-messages";
import type { Mode } from "./settings";
import { parsePauseFromPercent, parseThresholds } from "./thresholds-schema";

export const PAGE_CHANNEL = "mynaka/1";

export type ToWorker =
  | { type: "naka-ready" }
  | { type: "playlist-changed" }
  | {
      type: "finished";
      source: "threshold" | "explicit";
      progress: number;
      contentId: number;
      season?: number;
      episode?: number;
    }
  | { type: "status" }
  | { type: "resync" }
  | { type: "set-mode"; mode: Mode }
  | {
      type: "set-settings";
      thresholds: Thresholds;
      pauseFromPercent: number;
    }
  | RatingMessage
  | QuestionMessage
  | PageMessage;

export type ToNakaTab =
  | { type: "naka-call"; call: "playlistIds" }
  | {
      type: "naka-call";
      call: "add" | "remove" | "contentById" | "availableSeasons";
      contentId: number;
    }
  | { type: "naka-call"; call: "search"; query: string }
  | { type: "naka-account" };

export type NakaReplyError =
  | "no-token"
  | "session"
  | "rate-limit"
  | "unavailable"
  | "not-found";

// `value` is untrusted, whatever the parser did: the worker re-validates it with Plan 2's Naka parsers.
// It is absent for void calls (add, remove): Chrome messaging drops `undefined`, so `{ ok: true }` is normal.
export type NakaReply =
  | { ok: true; value?: unknown }
  | { ok: false; error: NakaReplyError };

export type PageEvent =
  | { channel: typeof PAGE_CHANNEL; kind: "playlist"; removed?: number }
  | ({ channel: typeof PAGE_CHANNEL; kind: "watched" } & ContentIds)
  | ({ channel: typeof PAGE_CHANNEL; kind: "unwatched" } & ContentIds);

export type Sender = {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { url?: string };
};
export type SenderRole = "naka-tab" | "status-page";

type FinishedSource = Extract<ToWorker, { type: "finished" }>["source"];
type NakaCall = Extract<ToNakaTab, { type: "naka-call" }>["call"];

const WORKER_TYPES = valuesOf<ToWorker["type"]>({
  "naka-ready": true,
  "playlist-changed": true,
  finished: true,
  status: true,
  resync: true,
  "set-mode": true,
  "set-settings": true,
  "rating-card": true,
  "rating-cards": true,
  rate: true,
  "dismiss-rating": true,
  ...QUESTION_TYPE_FLAGS,
  ...PAGE_TYPE_FLAGS,
});
const SOURCES = valuesOf<FinishedSource>({ threshold: true, explicit: true });
const MODE_VALUES = valuesOf<Mode>({ simulation: true, live: true });
const TAB_TYPES = valuesOf<ToNakaTab["type"]>({
  "naka-call": true,
  "naka-account": true,
});
const CALLS = valuesOf<NakaCall>({
  playlistIds: true,
  search: true,
  add: true,
  remove: true,
  contentById: true,
  availableSeasons: true,
});
const REPLY_ERRORS = valuesOf<NakaReplyError>({
  "no-token": true,
  session: true,
  "rate-limit": true,
  unavailable: true,
  "not-found": true,
});
const PAGE_KINDS = valuesOf<PageEvent["kind"]>({
  playlist: true,
  watched: true,
  unwatched: true,
});
const NAKA_ORIGIN = "https://naka.cx/";

// Runs a throwing parser. Any failure (a bad field, or a hostile getter) becomes undefined.
function safely<T>(parse: () => T): T | undefined {
  try {
    return parse();
  } catch {
    return undefined;
  }
}

function asProgress(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
    return fail("progress");
  }
  return raw === 0 ? 0 : raw; // -0 becomes 0
}

function asSearchQuery(raw: unknown): string {
  return checkQuery(asString(raw, "query"));
}

function parseFinished(record: Record<string, unknown>): ToWorker {
  return {
    type: "finished",
    source: asOneOf(record.source, SOURCES, "source"),
    progress: asProgress(record.progress),
    contentId: asId(record.contentId, "contentId"),
    ...playbackContext(record),
  };
}

function parseToWorkerRecord(record: Record<string, unknown>): ToWorker {
  const type = asOneOf(record.type, WORKER_TYPES, "type");
  if (type === "finished") return parseFinished(record);
  if (type === "set-mode") {
    return { type, mode: asOneOf(record.mode, MODE_VALUES, "mode") };
  }
  if (type === "set-settings") {
    return {
      type,
      thresholds: parseThresholds(record.thresholds),
      pauseFromPercent: parsePauseFromPercent(record.pauseFromPercent),
    };
  }
  if (isRatingType(type)) return parseRatingMessage(type, record);
  if (isQuestionType(type)) return parseQuestionMessage(type, record);
  if (isPageType(type)) return parsePageMessage(type, record);
  return { type };
}

export function parseToWorker(raw: unknown): ToWorker | undefined {
  return safely(() => parseToWorkerRecord(asRecord(raw, "message")));
}

function parseNakaCall(record: Record<string, unknown>): ToNakaTab {
  const call = asOneOf(record.call, CALLS, "call");
  if (call === "playlistIds") return { type: "naka-call", call };
  if (call === "search") {
    return { type: "naka-call", call, query: asSearchQuery(record.query) };
  }
  return {
    type: "naka-call",
    call,
    contentId: asId(record.contentId, "contentId"),
  };
}

function parseToNakaTabRecord(record: Record<string, unknown>): ToNakaTab {
  const type = asOneOf(record.type, TAB_TYPES, "type");
  return type === "naka-account" ? { type } : parseNakaCall(record);
}

export function parseToNakaTab(raw: unknown): ToNakaTab | undefined {
  return safely(() => parseToNakaTabRecord(asRecord(raw, "message")));
}

function parseNakaReplyRecord(record: Record<string, unknown>): NakaReply {
  if (record.ok === true) {
    return record.value === undefined
      ? { ok: true }
      : { ok: true, value: record.value };
  }
  if (record.ok === false) {
    return { ok: false, error: asOneOf(record.error, REPLY_ERRORS, "error") };
  }
  return fail("ok");
}

// Drops unknown TOP-LEVEL keys. `value` is passed through by reference and is untrusted: re-validate it.
export function parseNakaReply(raw: unknown): NakaReply | undefined {
  return safely(() => parseNakaReplyRecord(asRecord(raw, "reply")));
}

function parsePageEventRecord(record: Record<string, unknown>): PageEvent {
  asOneOf(record.channel, [PAGE_CHANNEL], "channel");
  const kind = asOneOf(record.kind, PAGE_KINDS, "kind");
  if (kind === "playlist") return playlistEvent(PAGE_CHANNEL, record);
  return {
    channel: PAGE_CHANNEL,
    kind,
    contentId: asId(record.contentId, "contentId"),
    ...playbackContext(record),
  };
}

export function parsePageEvent(raw: unknown): PageEvent | undefined {
  return safely(() => parsePageEventRecord(asRecord(raw, "event")));
}

const FRAME_TOP = 0;

function isNakaUrl(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith(NAKA_ORIGIN);
}

// A Naka tab: the top frame of a page on https://naka.cx/, never an iframe.
function isNakaTop(sender: Sender): boolean {
  return (
    sender.frameId === FRAME_TOP &&
    isNakaUrl(sender.url) &&
    isNakaUrl(sender.tab?.url)
  );
}

// The status page, with no tab or opened in a tab that shows the same page.
function isStatusPage(sender: Sender, extensionId: string): boolean {
  const status = `chrome-extension://${extensionId}/status.html`;
  if (sender.url !== status) return false;
  return sender.tab === undefined || sender.tab.url === status;
}

// Who sent a runtime message. The worker acts only for these two roles.
export function isTrustedSender(
  sender: Sender,
  extensionId: string,
): SenderRole | undefined {
  if (sender.id !== extensionId) return undefined;
  if (isStatusPage(sender, extensionId)) return "status-page";
  return isNakaTop(sender) ? "naka-tab" : undefined;
}

// One row per ToWorker type (the Record keeps the table exhaustive): the roles allowed to send it.
const SENDERS: Record<ToWorker["type"], readonly SenderRole[]> = {
  "naka-ready": ["naka-tab"],
  "playlist-changed": ["naka-tab"],
  finished: ["naka-tab"],
  status: ["status-page"],
  resync: ["status-page"],
  "set-mode": ["status-page"],
  "set-settings": ["status-page"],
  "rating-card": ["naka-tab"],
  "rating-cards": ["naka-tab"],
  rate: ["naka-tab"],
  "dismiss-rating": ["naka-tab"],
  ...QUESTION_SENDERS,
  ...PAGE_SENDERS,
};

// A trusted role may send only its own types: a naka.cx script must not ask for set-mode or resync.
export function allowedFor(role: SenderRole, msg: ToWorker): boolean {
  return SENDERS[msg.type].includes(role);
}
