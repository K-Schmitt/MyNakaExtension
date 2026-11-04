// Transport of the SensCritique client: one HTTP request, and one GraphQL POST to the Apollo endpoint.
//
// The auth token enters a request here and nowhere else: as the raw `authorization` header of a POST to
// APOLLO, with `credentials: "omit"`. It is never put in a URL, a body, an error message or a log.
// Error messages carry the operation name and the HTTP status only: a response body may hold personal data.

import {
  ScTimeoutError,
  ScUnauthenticatedError,
  ScUnavailableError,
} from "./sc-errors";
import { GQL } from "./sc-queries";

export type Fetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    credentials: "include" | "omit";
    redirect?: "error" | "follow" | "manual";
    /** Set by the worker's request timeout (Ruling 16), never by the clients. */
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type ScSession = { token?: string; username?: string };
export type ScDeps = { fetch: Fetch; getSession: () => Promise<ScSession> };

export type Step = {
  operationName: keyof typeof GQL;
  variables: Record<string, unknown>;
};
export type Envelope = { data: Record<string, unknown> };

const APOLLO = "https://apollo.senscritique.com/";
const MAX_BODY = 2_000_000;
const SC_429 = "HTTP 429";

export const JSON_TYPE = "application/json";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// The one place that calls getSession. Whatever it, or a getter or Proxy on what it resolves to, throws (a
// message, a stack, a cause or a field may carry the token or personal data) is dropped; a value that is not
// an object counts as no session, and a token or username that is not a non-empty string counts as missing.
export async function readSession(deps: ScDeps): Promise<ScSession> {
  try {
    const raw: unknown = await deps.getSession();
    const fields = isRecord(raw) ? raw : {};
    return { token: textOf(fields.token), username: textOf(fields.username) };
  } catch (error) {
    throw sessionError(error);
  }
}

// A rate limit or a timeout on the home page stays one, so that the breaker opens (M2, K4): only the
// class and the status are read, and the error is rebuilt from fixed text. Anything else, even an error
// that throws while it is looked at, is the one fixed "could not be read".
function sessionError(error: unknown): ScUnavailableError {
  try {
    if (error instanceof ScTimeoutError) return new ScTimeoutError("session");
    if (error instanceof ScUnavailableError && error.message.includes(SC_429)) {
      return new ScUnavailableError("SensCritique session: HTTP 429");
    }
  } catch {
    // Dropped: see above.
  }
  return new ScUnavailableError("SensCritique session: could not be read");
}

export async function send(
  fetch: Fetch,
  url: string,
  init: Parameters<Fetch>[1],
  label: string,
): Promise<string> {
  try {
    const response = await fetch(url, init);
    if (response.status !== 200) {
      throw new ScUnavailableError(
        `SensCritique ${label}: HTTP ${response.status}`,
      );
    }
    const text = await response.text();
    if (text.length > MAX_BODY) {
      throw new ScUnavailableError(
        `SensCritique ${label}: HTTP ${response.status}, response too large`,
      );
    }
    return text;
  } catch (error) {
    if (error instanceof ScTimeoutError) throw new ScTimeoutError(label);
    if (error instanceof ScUnavailableError) throw error;
    throw new ScUnavailableError(`SensCritique ${label}: request failed`);
  }
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ScUnavailableError(`SensCritique ${label}: response is not JSON`);
  }
}

function mentionsUnauthenticated(errors: unknown): boolean {
  if (!Array.isArray(errors)) return false;
  return errors.some(
    (e) =>
      isRecord(e) &&
      typeof e.message === "string" &&
      e.message.includes("Unauthenticated"),
  );
}

function openEnvelope(json: unknown, label: string): Envelope {
  if (!isRecord(json)) {
    throw new ScUnavailableError(`SensCritique ${label}: unexpected response`);
  }
  if (json.errors !== undefined) {
    if (mentionsUnauthenticated(json.errors)) {
      throw new ScUnauthenticatedError();
    }
    throw new ScUnavailableError(`SensCritique ${label}: GraphQL errors`);
  }
  if (!isRecord(json.data)) {
    throw new ScUnavailableError(`SensCritique ${label}: no data in response`);
  }
  return { data: json.data };
}

export async function post(
  fetch: Fetch,
  { operationName, variables }: Step,
  token: string | undefined,
): Promise<Envelope> {
  const headers = { "content-type": JSON_TYPE };
  const text = await send(
    fetch,
    APOLLO,
    {
      method: "POST",
      headers:
        token === undefined ? headers : { ...headers, authorization: token },
      body: JSON.stringify({
        operationName,
        variables,
        query: GQL[operationName],
      }),
      credentials: "omit",
      redirect: "error",
    },
    operationName,
  );
  return openEnvelope(parseJson(text, operationName), operationName);
}
