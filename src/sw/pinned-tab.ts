// One Naka tab per job (Ruling 9), the first one that answers (Ruling 20). A tab opened before the install,
// or any tab after an extension reload, has no content script: its send rejects. So, until a tab is pinned,
// a call tries the tabs found in their query order, and a rejected send moves on to the next one. The first
// send that resolves, whatever its reply, pins that tab for every later call of the job: the account the job
// checked is the account its writes go to. When no tab answers, or once the pinned tab's send rejects, the
// tab is lost for the job (Ruling 17): no later call reaches the tabs, and every call rejects with
// no-naka-tab. A job that found no tab at all looks again at its next call.
//
// The proxy's 20 s timeout covers a whole call, its tries included. A try still running when its call timed
// out may still pin its tab; no job calls Naka again after its first call failed (the binding check and the
// content read both end the job), so that pin is never used.

import { JobRejected } from "../ext/job-error";
import type { ToNakaTab } from "../ext/messages";
import { NakaUnavailableError } from "../naka/naka-errors";

export type TabsPort = {
  query(url: string): Promise<{ id: number }[]>;
  send(tabId: number, msg: ToNakaTab): Promise<unknown>;
};

/** Sends one message to the job's tab; resolves with its raw, untrusted reply. */
export type TabExchange = (msg: ToNakaTab) => Promise<unknown>;

const NAKA_TABS_URL = "https://naka.cx/*";

async function findTabs(tabs: TabsPort): Promise<number[]> {
  let found: { id: number }[];
  try {
    found = await tabs.query(NAKA_TABS_URL);
  } catch {
    throw new NakaUnavailableError("Naka tab: unreachable");
  }
  if (found.length === 0) throw new JobRejected("no-naka-tab");
  return found.map((tab) => tab.id);
}

// The first tab whose send resolves, and its reply; undefined when every send rejected.
async function firstAnswer(
  tabs: TabsPort,
  ids: number[],
  msg: ToNakaTab,
): Promise<{ id: number; reply: unknown } | undefined> {
  for (const id of ids) {
    try {
      return { id, reply: await tabs.send(id, msg) };
    } catch {
      // No content script in this tab: the next one.
    }
  }
  return undefined;
}

export function pinFirstAnswering(
  tabs: TabsPort,
  onLost: (error: JobRejected) => void = () => undefined,
): TabExchange {
  let pinned: number | undefined;
  let lost = false;
  const lose = (): never => {
    lost = true;
    onLost(new JobRejected("no-naka-tab"));
    throw new JobRejected("no-naka-tab");
  };
  const pin = async (msg: ToNakaTab): Promise<unknown> => {
    const answer = await firstAnswer(tabs, await findTabs(tabs), msg);
    if (answer === undefined) return lose();
    pinned = answer.id;
    return answer.reply;
  };
  return async (msg) => {
    if (lost) throw new JobRejected("no-naka-tab");
    if (pinned === undefined) return pin(msg);
    try {
      return await tabs.send(pinned, msg);
    } catch {
      return lose();
    }
  };
}
