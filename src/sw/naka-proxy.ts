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
  asSeasons,
  unexpected,
} from "./naka-values";
import {
  pinFirstAnswering,
  type TabExchange,
  type TabsPort,
} from "./pinned-tab";

export type { TabsPort } from "./pinned-tab";

export const NAKA_CALL_TIMEOUT_MS = 20000;

const NOT_FOUND = 404;
const RATE_LIMITED = 429;

export type Timer = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export type NakaProxy = NakaClient & { account(): Promise<string | undefined> };

const realTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

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

// A late answer, after the timeout, settles an already settled promise: it changes nothing. A timeout is
// not a lost tab: it stays unavailable (Ruling 17).
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
  exchange: TabExchange,
  timer: Timer,
  msg: ToNakaTab,
): Promise<unknown> {
  return withTimeout(timer, async () => replyValue(await exchange(msg)));
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

// 404 means "no season list", like contentById's "not in the catalogue".
async function availableSeasons(read: () => Promise<unknown>) {
  let value: unknown;
  try {
    value = await read();
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
  return value === undefined ? undefined : asSeasons(value);
}

// One proxy per job: its calls go to the tab it pins (see pinned-tab.ts); `onLost` hears that tab is gone.
export function createNakaProxy(
  tabs: TabsPort,
  timer: Timer = realTimer,
  onLost?: (error: JobRejected) => void,
): NakaProxy {
  const exchange = pinFirstAnswering(tabs, onLost);
  const call = (msg: ToNakaTab) => ask(exchange, timer, msg);
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
    availableSeasons: async (contentId) => {
      checkContentId(contentId);
      return availableSeasons(() =>
        call({ type: "naka-call", call: "availableSeasons", contentId }),
      );
    },
    account: async () => asAccount(await call({ type: "naka-account" })),
  };
}
