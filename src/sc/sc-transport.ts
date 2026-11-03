// Transport of the SensCritique client: one HTTP request, and one GraphQL POST to the Apollo endpoint.
//
// The auth token enters a request here and nowhere else: as the raw `authorization` header of a POST to
// APOLLO, with `credentials: "omit"`. It is never put in a URL, a body, an error message or a log.
// Error messages carry the operation name and the HTTP status only: a response body may hold personal data.

import { ScUnauthenticatedError, ScUnavailableError } from "./sc-errors";
import { GQL } from "./sc-queries";

export type Fetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    credentials: "include" | "omit";
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

export const JSON_TYPE = "application/json";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// An empty token counts as no token.
export function tokenOf(session: ScSession): string | undefined {
  return session.token || undefined;
}

export async function send(
  fetch: Fetch,
  url: string,
  init: Parameters<Fetch>[1],
  label: string,
): Promise<string> {
  try {
    const response = await fetch(url, init);
    if (response.status === 200) return await response.text();
    throw new ScUnavailableError(
      `SensCritique ${label}: HTTP ${response.status}`,
    );
  } catch (error) {
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
    },
    operationName,
  );
  return openEnvelope(parseJson(text, operationName), operationName);
}
