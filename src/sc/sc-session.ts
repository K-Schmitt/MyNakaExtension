// Reads the owner's SensCritique session from the home page, for the service worker's getSession.
//
// The token is the page's `__NEXT_DATA__` → props.pageProps.cookies.SC_AUTH, the username its
// props.pageProps.meInfos.username. Each read fetches the page again: nothing is cached. The token lives
// in a local variable and in the returned session only. The page holds the token, so every failure is a
// fixed message (here or in `send`) with no cause: no error carries any text of the page.

import { ScUnavailableError } from "./sc-errors";
import { type Fetch, isRecord, type ScSession, send } from "./sc-transport";
import { nextDataText } from "./season-episodes";

type Fields = Record<string, unknown>;

const HOME = "https://www.senscritique.com/";
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_USERNAME = 64;

function fieldsOf(value: unknown): Fields {
  return isRecord(value) ? value : {};
}

function readHomePage(fetch: Fetch): Promise<string> {
  return send(
    fetch,
    HOME,
    { method: "GET", headers: {}, credentials: "include", redirect: "follow" },
    "session",
  );
}

// A page without `__NEXT_DATA__` has no session. A V8 JSON error quotes the text it read: it is dropped.
function pageData(html: string): unknown {
  const text = nextDataText(html);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ScUnavailableError("SensCritique session: page data is not JSON");
  }
}

function pagePropsOf(data: unknown): Fields {
  return fieldsOf(fieldsOf(fieldsOf(data).props).pageProps);
}

// A missing SC_AUTH means logged out. One of any other shape is not a token this code knows how to send.
function tokenOf(pageProps: Fields): string | undefined {
  const token = fieldsOf(pageProps.cookies).SC_AUTH;
  if (token === undefined) return undefined;
  if (typeof token !== "string" || !TOKEN_SHAPE.test(token)) {
    throw new ScUnavailableError(
      "SensCritique session: unexpected token shape",
    );
  }
  return token;
}

function usernameOf(pageProps: Fields): string | undefined {
  const username = fieldsOf(pageProps.meInfos).username;
  if (typeof username !== "string" || username === "") return undefined;
  return username.length <= MAX_USERNAME ? username : undefined;
}

function sessionOf(pageProps: Fields): ScSession {
  const session: ScSession = {};
  const token = tokenOf(pageProps);
  const username = usernameOf(pageProps);
  if (token !== undefined) session.token = token;
  if (username !== undefined) session.username = username;
  return session;
}

export function createSessionReader(fetch: Fetch): () => Promise<ScSession> {
  return async () => {
    const html = await readHomePage(fetch);
    return sessionOf(pagePropsOf(pageData(html)));
  };
}
