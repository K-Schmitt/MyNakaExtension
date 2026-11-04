// One Naka tab per job (Ruling 9): the first tab the job finds answers every call of the job, so the
// account it checked is the account its writes go to. A job that found no tab looks again next call.
// Once a send to the pinned tab fails, the tab is lost for the job (Ruling 17): no later call of the job
// reaches the tabs, and there is no new lookup; the proxy then rejects with no-naka-tab.

import { JobRejected } from "../ext/job-error";
import type { TabsPort } from "./naka-proxy";

export function pinFirstTab(
  tabs: TabsPort,
  onLost: (error: JobRejected) => void = () => undefined,
): TabsPort {
  let pinned: { id: number } | undefined;
  let lost = false;
  return {
    async query(url) {
      if (lost) return [];
      if (pinned !== undefined) return [pinned];
      const found = await tabs.query(url);
      pinned = found[0];
      return found;
    },
    async send(tabId, msg) {
      try {
        return await tabs.send(tabId, msg);
      } catch (error) {
        lost = true;
        onLost(new JobRejected("no-naka-tab"));
        throw error;
      }
    },
  };
}
