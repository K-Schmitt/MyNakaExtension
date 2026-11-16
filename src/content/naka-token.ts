// The Naka token, read from the page's own auth record for the client's token function, in the isolated
// script only: the token never leaves the Naka tab's isolated world. It is `state.token` of
// localStorage["nakastream-auth"]: undefined when logged out or unreadable, and it never throws, so no error
// can carry the record's text.

import { isRecord } from "../naka/naka-transport";
import { AUTH_KEY } from "./naka-bridge";

function tokenOf(json: unknown): unknown {
  return isRecord(json) && isRecord(json.state) ? json.state.token : undefined;
}

export function readNakaToken(
  storage: Pick<Storage, "getItem">,
): string | undefined {
  try {
    const raw = storage.getItem(AUTH_KEY);
    if (typeof raw !== "string") return undefined;
    const token = tokenOf(JSON.parse(raw));
    return typeof token === "string" && token !== "" ? token : undefined;
  } catch {
    return undefined;
  }
}
