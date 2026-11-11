// The MAIN-world wrapper of the page's fetch (Ruling 10). It calls the page's fetch with the page's own
// arguments and receiver and returns the very promise it got: the request and the response are never
// touched. On the side it resolves the URL against the page, classifies the request, and posts the event
// only once the response is ok, so a refused "vu" never counts. It reads the method and a string body,
// never a header (the page's Authorization header holds the Naka token) and never a Request's body.
// One response body is read, for one path only (GET /api/v1/skip-segments, where the credits start): a
// CLONE of the ok response, as JSON, never the page's own response and never a header of either.
// Any error of its own is swallowed: the page's fetch goes on as if nothing watched it.
//
// Two differences the page could notice, both accepted (M10): observing the outcome of a classified
// request attaches a handler to the page's promise, which silences the page's `unhandledrejection` for
// that request; and the wrapper's name, length and toString differ from the native fetch.

import type { PageEvent } from "../ext/messages";
import {
  type CreditsQuery,
  creditsEvent,
  creditsRequest,
} from "./credits-observer";
import { classifyRequest } from "./fetch-observer";

type Post = (event: PageEvent) => void;

function ignore(): void {}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

// A string, a URL, or a Request (anything with a string `url`).
function urlOf(input: unknown): string {
  const url = asRecord(input)?.url;
  return typeof url === "string" ? url : String(input);
}

function methodOf(input: unknown, init: unknown): string {
  const method = asRecord(init)?.method ?? asRecord(input)?.method;
  return typeof method === "string" ? method : "GET";
}

type Watched =
  | { kind: "request"; event: PageEvent }
  | { kind: "credits"; query: CreditsQuery };

function classify(args: unknown[], base: () => string): Watched | undefined {
  const [input, init] = args;
  const url = new URL(urlOf(input), base()).href;
  const method = methodOf(input, init);
  const event = classifyRequest(method, url, asRecord(init)?.body);
  if (event !== undefined) return { kind: "request", event };
  const query = creditsRequest(method, url);
  return query === undefined ? undefined : { kind: "credits", query };
}

// The clone is taken in the first handler of the page's promise, before the page can read its own body.
async function readCredits(
  answer: Response,
  query: CreditsQuery,
  post: Post,
): Promise<void> {
  const event = creditsEvent(query, await answer.clone().json());
  if (event !== undefined) post(event);
}

function onAnswer(answer: Response, watched: Watched, post: Post): unknown {
  if (!answer.ok) return undefined;
  if (watched.kind === "request") return post(watched.event);
  return readCredits(answer, watched.query, post);
}

function observe(
  args: unknown[],
  response: Promise<Response>,
  post: Post,
  base: () => string,
): void {
  try {
    const watched = classify(args, base);
    if (watched === undefined) return;
    response.then((answer) => onAnswer(answer, watched, post)).catch(ignore);
  } catch {
    // Never the page's problem.
  }
}

export function wrapFetch(
  original: typeof fetch,
  post: Post,
  base: () => string,
): typeof fetch {
  return function wrapped(this: unknown, ...args: Parameters<typeof fetch>) {
    const response: Promise<Response> = Reflect.apply(original, this, args);
    observe(args, response, post, base);
    return response;
  };
}
