// The messages exchanged between the extension's parts, and the parsers that guard each direction.
// Every message from another context is untrusted: a parser takes `unknown`, never throws, and returns a
// fresh object holding only the known keys (anything else, a token included, is dropped), or undefined.

import { checkQuery } from "../naka/naka-input";
import {
  asId,
  asOneOf,
  asRecord,
  asString,
  fail,
  whenPresent,
} from "./field-checks";
import type { Mode } from "./settings";

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
  | { type: "set-mode"; mode: Mode };

export type ToNakaTab =
  | { type: "naka-call"; call: "playlistIds" }
  | {
      type: "naka-call";
      call: "add" | "remove" | "contentById";
      contentId: number;
    }
  | { type: "naka-call"; call: "search"; query: string }
  | { type: "naka-account" };

export type NakaReply =
  | { ok: true; value: unknown }
  | { ok: false; error: "no-token" | "unavailable" | "not-found" };

export type PageEvent =
  | { channel: typeof PAGE_CHANNEL; kind: "playlist" }
  | {
      channel: typeof PAGE_CHANNEL;
      kind: "watched";
      contentId: number;
      season?: number;
      episode?: number;
    };

export type Sender = { id?: string; url?: string; tab?: { url?: string } };
export type SenderRole = "naka-tab" | "status-page";

const SOURCES = ["threshold", "explicit"] as const;
const MODE_VALUES: readonly Mode[] = ["simulation", "live"];
const ID_CALLS = ["add", "remove", "contentById"] as const;
const REPLY_ERRORS = ["no-token", "unavailable", "not-found"] as const;
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
  return raw;
}

function asSearchQuery(raw: unknown): string {
  try {
    return checkQuery(asString(raw, "query"));
  } catch {
    return fail("query");
  }
}

// Optional season and episode, kept only when present.
function playbackContext(record: Record<string, unknown>): {
  season?: number;
  episode?: number;
} {
  const season = whenPresent(record.season, (v) => asId(v, "season"));
  const episode = whenPresent(record.episode, (v) => asId(v, "episode"));
  return {
    ...(season === undefined ? {} : { season }),
    ...(episode === undefined ? {} : { episode }),
  };
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
  const type = asOneOf(
    record.type,
    [
      "naka-ready",
      "playlist-changed",
      "finished",
      "status",
      "resync",
      "set-mode",
    ],
    "type",
  );
  if (type === "finished") return parseFinished(record);
  if (type === "set-mode") {
    return { type, mode: asOneOf(record.mode, MODE_VALUES, "mode") };
  }
  return { type };
}

export function parseToWorker(raw: unknown): ToWorker | undefined {
  return safely(() => parseToWorkerRecord(asRecord(raw, "message")));
}

function parseNakaCall(record: Record<string, unknown>): ToNakaTab {
  const call = asOneOf(
    record.call,
    ["playlistIds", "search", ...ID_CALLS],
    "call",
  );
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
  const type = asOneOf(record.type, ["naka-call", "naka-account"], "type");
  return type === "naka-account" ? { type } : parseNakaCall(record);
}

export function parseToNakaTab(raw: unknown): ToNakaTab | undefined {
  return safely(() => parseToNakaTabRecord(asRecord(raw, "message")));
}

function parseNakaReplyRecord(record: Record<string, unknown>): NakaReply {
  if (record.ok === true) return { ok: true, value: record.value };
  if (record.ok === false) {
    return { ok: false, error: asOneOf(record.error, REPLY_ERRORS, "error") };
  }
  return fail("ok");
}

// Builds a fresh reply from the known keys only: a token, or anything else, never gets through.
export function parseNakaReply(raw: unknown): NakaReply | undefined {
  return safely(() => parseNakaReplyRecord(asRecord(raw, "reply")));
}

function parsePageEventRecord(record: Record<string, unknown>): PageEvent {
  asOneOf(record.channel, [PAGE_CHANNEL], "channel");
  const kind = asOneOf(record.kind, ["playlist", "watched"], "kind");
  if (kind === "playlist") return { channel: PAGE_CHANNEL, kind };
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

// Who sent a runtime message. The worker acts only for these two roles.
export function isTrustedSender(
  sender: Sender,
  extensionId: string,
): SenderRole | undefined {
  if (sender.id !== extensionId) return undefined;
  if (sender.tab === undefined) {
    const status = `chrome-extension://${extensionId}/status.html`;
    return sender.url === status ? "status-page" : undefined;
  }
  const tabUrl = sender.tab.url;
  return typeof tabUrl === "string" && tabUrl.startsWith(NAKA_ORIGIN)
    ? "naka-tab"
    : undefined;
}
