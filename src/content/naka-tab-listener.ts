// The Naka tab's chrome.runtime listener (Ruling 9): only this extension may ask, and only a known call
// runs. The sender is checked before the message is even read; the answer comes later, so the listener
// returns true to keep Chrome's channel open.

import { parseToNakaTab } from "../ext/messages";
import type { NakaClient } from "../naka/naka-client";
import { handleNakaCall } from "./naka-bridge";

export type TabListener = (
  raw: unknown,
  sender: { id?: string },
  respond: (answer: unknown) => void,
) => boolean;

function ignore(): void {}

export function createTabListener(
  extensionId: string,
  client: NakaClient,
  account: () => string | undefined,
): TabListener {
  return (raw, sender, respond) => {
    if (sender.id !== extensionId) return false;
    const msg = parseToNakaTab(raw);
    if (msg === undefined) return false;
    handleNakaCall(msg, client, account).then(respond).catch(ignore);
    return true;
  };
}
