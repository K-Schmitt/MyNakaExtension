// Worker side of the Naka bridge: a NakaClient whose calls run in the Naka tab. The worker never holds the
// Naka token; it sends a request, waits for the reply and re-validates it (see naka-values.ts). Every failure
// is a fixed-text error: nothing the tab said is copied into one.

import { JobRejected } from "../ext/job-error";
import { parseNakaReply, type ToNakaTab } from "../ext/messages";
import type { NakaClient } from "../naka/naka-client";
import { NakaUnavailableError } from "../naka/naka-errors";
import { checkContentId, checkQuery } from "../naka/naka-input";
import {
  asAccount,
  asIdList,
  asItem,
  asItems,
  asNothing,
  unexpected,
} from "./naka-values";

export const NAKA_CALL_TIMEOUT_MS = 20000;

const NAKA_TABS_URL = "https://naka.cx/*";
const NOT_FOUND = 404;
const RATE_LIMITED = 429;

export type TabsPort = {
  query(url: string): Promise<{ id: number }[]>;
  send(tabId: number, msg: ToNakaTab): Promise<unknown>;
};

export type Timer = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export type NakaProxy = NakaClient & { account(): Promise<string | undefined> };

const realTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

async function firstTabId(tabs: TabsPort): Promise<number> {
  let found: { id: number }[];
  try {
    found = await tabs.query(NAKA_TABS_URL);
  } catch {
    throw new NakaUnavailableError("Naka tab: unreachable");
  }
  const first = found[0];
  if (first === undefined) throw new JobRejected("no-naka-tab");
  return first.id;
}

async function exchange(tabs: TabsPort, msg: ToNakaTab): Promise<unknown> {
  const tabId = await firstTabId(tabs);
  try {
    return await tabs.send(tabId, msg);
  } catch {
    throw new NakaUnavailableError("Naka tab: unreachable");
  }
}

// The tab's answer: its value, or a throw with a fixed error. `value` is still untrusted.
function replyValue(raw: unknown): unknown {
  const reply = parseNakaReply(raw);
  if (reply === undefined) return unexpected();
  if (reply.ok) return reply.value;
  if (reply.error === "no-token" || reply.error === "session") {
    throw new JobRejected("naka-session");
  }
  if (reply.error === "rate-limit") {
    throw new NakaUnavailableError("Naka tab: HTTP 429", RATE_LIMITED);
  }
  if (reply.error === "not-found") {
    throw new NakaUnavailableError("Naka tab: HTTP 404", NOT_FOUND);
  }
  throw new NakaUnavailableError("Naka tab: unavailable");
}

// A late answer, after the timeout, settles an already settled promise: it changes nothing.
function withTimeout<T>(timer: Timer, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = timer.set(
      () => reject(new NakaUnavailableError("Naka tab: no answer in time")),
      NAKA_CALL_TIMEOUT_MS,
    );
    work()
      .then(resolve, reject)
      .finally(() => timer.clear(handle));
  });
}

async function ask(
  tabs: TabsPort,
  timer: Timer,
  msg: ToNakaTab,
): Promise<unknown> {
  return withTimeout(timer, async () => replyValue(await exchange(tabs, msg)));
}

function isNotFound(error: unknown): boolean {
  return error instanceof NakaUnavailableError && error.status === NOT_FOUND;
}

// Mirrors the client: 404 means "not in the catalogue", and the item must be the one asked for.
async function contentById(read: () => Promise<unknown>, contentId: number) {
  let value: unknown;
  try {
    value = await read();
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
  if (value === undefined) return undefined;
  const item = asItem(value);
  return item.contentId === contentId ? item : unexpected();
}

export function createNakaProxy(
  tabs: TabsPort,
  timer: Timer = realTimer,
): NakaProxy {
  const call = (msg: ToNakaTab) => ask(tabs, timer, msg);
  return {
    playlistIds: async () =>
      asIdList(await call({ type: "naka-call", call: "playlistIds" })),
    addToPlaylist: async (contentId) => {
      checkContentId(contentId);
      asNothing(await call({ type: "naka-call", call: "add", contentId }));
    },
    removeFromPlaylist: async (contentId) => {
      checkContentId(contentId);
      asNothing(await call({ type: "naka-call", call: "remove", contentId }));
    },
    search: async (query) => {
      const trimmed = checkQuery(query);
      return asItems(
        await call({ type: "naka-call", call: "search", query: trimmed }),
      );
    },
    contentById: async (contentId) => {
      checkContentId(contentId);
      return contentById(
        () => call({ type: "naka-call", call: "contentById", contentId }),
        contentId,
      );
    },
    account: async () => asAccount(await call({ type: "naka-account" })),
  };
}
