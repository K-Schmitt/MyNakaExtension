// Transport of the Naka client: one HTTP request to https://naka.cx/api/v1.
//
// The auth token enters a request here and nowhere else: as the `authorization: Bearer` header of a request
// to BASE, with the browser's default credentials. It is never put in a URL, a body, an error message or a
// log. Error messages carry the operation label and the HTTP status only: a response body may hold data.

import type { Fetch } from "../core/fetch-type";
import { NakaUnavailableError } from "./naka-errors";

export type NakaDeps = { fetch: Fetch; token: () => string | undefined };

export type Request = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  label: string;
  body?: unknown;
};

const BASE = "https://naka.cx/api/v1";
const MAX_BODY = 2_000_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The one place that calls deps.token(). Whatever it throws (a message or a stack may carry the token) is
// dropped; only a non-empty string counts as a token.
export function readToken(deps: NakaDeps): string {
  let raw: unknown;
  try {
    raw = deps.token();
  } catch {
    throw new NakaUnavailableError("Naka session: could not be read");
  }
  if (typeof raw !== "string" || raw === "") {
    throw new NakaUnavailableError("no token");
  }
  return raw;
}

function headersOf(token: string, hasBody: boolean): Record<string, string> {
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
  };
  return hasBody ? { ...headers, "content-type": "application/json" } : headers;
}

// Resolves with the body text on any 2xx; throws NakaUnavailableError (with the status) otherwise.
export async function send(
  fetch: Fetch,
  token: string,
  { method, path, label, body }: Request,
): Promise<string> {
  try {
    const init: Parameters<Fetch>[1] = {
      method,
      headers: headersOf(token, body !== undefined),
      credentials: "include",
      redirect: "error",
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(`${BASE}${path}`, init);
    const status = response.status;
    if (!(status >= 200 && status < 300)) {
      throw new NakaUnavailableError(`Naka ${label}: HTTP ${status}`, status);
    }
    const text = await response.text();
    if (text.length > MAX_BODY) {
      throw new NakaUnavailableError(
        `Naka ${label}: HTTP ${status}, response too large`,
        status,
      );
    }
    return text;
  } catch (error) {
    if (error instanceof NakaUnavailableError) throw error;
    throw new NakaUnavailableError(`Naka ${label}: request failed`);
  }
}

export function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new NakaUnavailableError(`Naka ${label}: response is not JSON`);
  }
}
