// The MAIN-world wrapper of the page's fetch (Ruling 10). It calls the page's fetch with the page's own
// arguments and receiver and returns the very promise it got: the request and the response are never
// touched. On the side it resolves the URL against the page, classifies the request, and posts the event
// only once the response is ok, so a refused "vu" never counts. It reads the method and a string body,
// never a header (the page's Authorization header holds the Naka token) and never a Request's body.
// Any error of its own is swallowed: the page's fetch goes on as if nothing watched it.
//
// Two differences the page could notice, both accepted (M10): observing the outcome of a classified
// request attaches a handler to the page's promise, which silences the page's `unhandledrejection` for
// that request; and the wrapper's name, length and toString differ from the native fetch.

import type { PageEvent } from "../ext/messages";
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

function classify(args: unknown[], base: () => string): PageEvent | undefined {
  const [input, init] = args;
  const url = new URL(urlOf(input), base()).href;
  return classifyRequest(methodOf(input, init), url, asRecord(init)?.body);
}

function observe(
  args: unknown[],
  response: Promise<Response>,
  post: Post,
  base: () => string,
): void {
  try {
    const event = classify(args, base);
    if (event === undefined) return;
    response
      .then((answer) => {
        if (answer.ok) post(event);
      })
      .catch(ignore);
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
