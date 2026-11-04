// Test-only fakes for the Naka bridge suites: a fake Naka API, a fake tab that runs the REAL tab handler, and
// a log of everything that crosses the tabs port.
import { handleNakaCall } from "../src/content/naka-bridge";
import type { ToNakaTab } from "../src/ext/messages";
import {
  createNakaClient,
  type Fetch,
  type NakaClient,
} from "../src/naka/naka-client";
import type { TabsPort } from "../src/sw/naka-proxy";

export const MARKER = "TOKEN-MARKER-7f3a9c";

export type ApiCall = { url: string; init: Parameters<Fetch>[1] };
export type ApiReply = { status: number; body: string };

export const json = (value: unknown, status = 200): ApiReply => ({
  status,
  body: JSON.stringify(value),
});

export function entry(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    tmdbId: 1000 + id,
    mediaType: "tv",
    title: `Titre ${id}`,
    originalTitle: `Original ${id}`,
    releaseDate: "2020-05-17",
    ...extra,
  };
}

export function fakeApi(respond: (call: ApiCall) => ApiReply) {
  const calls: ApiCall[] = [];
  const fetch: Fetch = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const { status, body } = respond(call);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    };
  };
  return { fetch, calls };
}

// The Naka API the round trips talk to.
export function standardApi(call: ApiCall): ApiReply {
  const { url } = call;
  if (url.endsWith("/playlist/ids")) {
    return json({ contentIds: [3, 1, 2], limit: 500 });
  }
  if (url.includes("/browse/search")) {
    return json({ data: [entry(1), entry(2, { releaseDate: undefined })] });
  }
  if (url.endsWith("/browse/7")) return json(entry(7));
  if (url.endsWith("/browse/8")) return json({}, 404);
  return json({});
}

export function clientOn(fetch: Fetch, token = MARKER): NakaClient {
  return createNakaClient({ fetch, token: () => token });
}

export type Traffic = { sent: unknown[]; returned: unknown[] };

// What Chrome messaging does to a payload: structured data only, `undefined` dropped.
const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

export function tabRunning(
  client: NakaClient,
  account: () => string | undefined,
  traffic: Traffic = { sent: [], returned: [] },
): { tabs: TabsPort; traffic: Traffic } {
  const tabs: TabsPort = {
    query: async () => [{ id: 11 }, { id: 12 }],
    send: async (_tabId: number, msg: ToNakaTab) => {
      traffic.sent.push(wire(msg));
      const reply = wire(
        await handleNakaCall(wire(msg) as ToNakaTab, client, account),
      );
      traffic.returned.push(reply);
      return reply;
    },
  };
  return { tabs, traffic };
}

export function portAnswering(
  answer: (msg: ToNakaTab) => unknown,
  tabIds: number[] = [11],
): TabsPort & {
  sent: { tabId: number; msg: ToNakaTab }[];
  queried: string[];
} {
  const sent: { tabId: number; msg: ToNakaTab }[] = [];
  const queried: string[] = [];
  return {
    sent,
    queried,
    query: async (url) => {
      queried.push(url);
      return tabIds.map((id) => ({ id }));
    },
    send: async (tabId, msg) => {
      sent.push({ tabId, msg });
      return answer(msg);
    },
  };
}

export async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to reject with an Error");
}

// Every string reachable from a value: keys, string values, and for errors every own key, `cause` included.
export function strings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  const own = Reflect.ownKeys(value).flatMap((key) => [
    typeof key === "string" ? key : String(key.description),
    ...strings(Reflect.get(value, key), seen),
  ]);
  if (value instanceof Error) {
    own.push(value.message, value.name, String(value.stack));
  }
  return own;
}
