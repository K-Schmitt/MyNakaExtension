// Tab side of the Naka bridge. It runs in the Naka tab's isolated content script and answers the worker's
// requests with the client the entry file built. The Naka token is bound inside that client (its `token`
// function) and never reaches this file: a reply carries a value or one of five fixed error codes, never the
// text, the cause or a field of an error.

import type { NakaReply, NakaReplyError, ToNakaTab } from "../ext/messages";
import type { NakaClient } from "../naka/naka-client";
import { NakaUnavailableError } from "../naka/naka-errors";
import { isPositiveId } from "../naka/naka-input";
import { isRecord } from "../naka/naka-transport";

export const AUTH_KEY = "nakastream-auth";
const NOT_FOUND = 404;

const RATE_LIMITED = 429;
const SESSION_STATUSES: readonly number[] = [401, 403];

function userId(json: unknown): unknown {
  if (!isRecord(json) || !isRecord(json.state)) return undefined;
  const { user } = json.state;
  return isRecord(user) ? user.id : undefined;
}

// The account is `String(state.user.id)`. `state.user` also holds the e-mail and the full name: only `id`
// is read, and only a positive safe integer counts.
export function readAccount(
  storage: Pick<Storage, "getItem">,
): string | undefined {
  try {
    const raw = storage.getItem(AUTH_KEY);
    if (typeof raw !== "string") return undefined;
    const id = userId(JSON.parse(raw));
    return isPositiveId(id) ? String(id) : undefined;
  } catch {
    return undefined;
  }
}

// Compile-time exhaustive; at run time a call the code does not know fails closed (the reply is `unavailable`).
function unknownCall(_msg: never): never {
  throw new Error("unknown Naka call");
}

async function run(
  msg: ToNakaTab,
  client: NakaClient,
  account: () => string | undefined,
): Promise<unknown> {
  if (msg.type === "naka-account") return account();
  switch (msg.call) {
    case "playlistIds":
      return client.playlistIds();
    case "search":
      return client.search(msg.query);
    case "contentById":
      return client.contentById(msg.contentId);
    case "add":
      return client.addToPlaylist(msg.contentId);
    case "remove":
      return client.removeFromPlaylist(msg.contentId);
    default:
      return unknownCall(msg);
  }
}

// Fixed codes only: what an error says is never looked at beyond its class, its status and "no token".
function errorCode(error: unknown): NakaReplyError {
  if (!(error instanceof NakaUnavailableError)) return "unavailable";
  if (error.status === NOT_FOUND) return "not-found";
  if (error.status === RATE_LIMITED) return "rate-limit";
  if (SESSION_STATUSES.includes(error.status)) return "session";
  if (error.status === 0 && error.message === "no token") return "no-token";
  return "unavailable";
}

export async function handleNakaCall(
  msg: ToNakaTab,
  client: NakaClient,
  account: () => string | undefined,
): Promise<NakaReply> {
  try {
    const value = await run(msg, client, account);
    return value === undefined ? { ok: true } : { ok: true, value };
  } catch (error) {
    return { ok: false, error: errorCode(error) };
  }
}
