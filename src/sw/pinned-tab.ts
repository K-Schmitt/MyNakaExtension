// One Naka tab per job, the first one that answers. A tab opened before the install,
// or any tab after an extension reload, has no content script: its send rejects. So, until a tab is pinned,
// a call tries the tabs found in their query order, and a rejected send moves on to the next one. The first
// send that resolves, whatever its reply, pins that tab for every later call of the job: the account the job
// checked is the account its writes go to. When no tab answers, or once the pinned tab's send rejects, the
// tab is lost for the job: no later call reaches the tabs, and every call rejects with the
// code of the loss. When the pinned tab's send rejects, one tabs.query tells a tab that changed page or
// was reloaded (still listed: naka-tab-changed) from a closed one (no-naka-tab; so is a query that
// throws); nothing is retried on that tab. A job that found no tab at all looks again at its
// next call.
//
// The proxy's 20 s timeout covers a whole call, its tries included. A try still running when its call timed
// out may still pin its tab; no job calls Naka again after its first call failed (the binding check and the
// content read both end the job), so that pin is never used.

import { type JobError, JobRejected } from "../ext/job-error";
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

// Why a pinned tab stopped answering: still listed means it changed page or was reloaded.
async function lossCode(tabs: TabsPort, pinned: number): Promise<JobError> {
  try {
    const found = await tabs.query(NAKA_TABS_URL);
    return found.some((tab) => tab.id === pinned)
      ? "naka-tab-changed"
      : "no-naka-tab";
  } catch {
    return "no-naka-tab";
  }
}

export function pinFirstAnswering(
  tabs: TabsPort,
  onLost: (error: JobRejected) => void = () => undefined,
): TabExchange {
  let pinned: number | undefined;
  let lost: JobError | undefined;
  const lose = (code: JobError): never => {
    lost = code;
    onLost(new JobRejected(code));
    throw new JobRejected(code);
  };
  const pin = async (msg: ToNakaTab): Promise<unknown> => {
    const answer = await firstAnswer(tabs, await findTabs(tabs), msg);
    if (answer === undefined) return lose("no-naka-tab");
    pinned = answer.id;
    return answer.reply;
  };
  return async (msg) => {
    if (lost !== undefined) throw new JobRejected(lost);
    if (pinned === undefined) return pin(msg);
    try {
      return await tabs.send(pinned, msg);
    } catch {
      // Latched at once: a query that never settles must not leave the tab open to later calls.
      lost = "no-naka-tab";
      return lose(await lossCode(tabs, pinned));
    }
  };
}
