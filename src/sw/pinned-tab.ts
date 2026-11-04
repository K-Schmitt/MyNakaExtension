// One Naka tab per job (Ruling 9): the first tab the job finds answers every call of the job, so the
// account it checked is the account its writes go to. A job that found no tab looks again next call.

import type { TabsPort } from "./naka-proxy";

export function pinFirstTab(tabs: TabsPort): TabsPort {
  let pinned: { id: number } | undefined;
  return {
    async query(url) {
      if (pinned !== undefined) return [pinned];
      const found = await tabs.query(url);
      pinned = found[0];
      return found;
    },
    send: (tabId, msg) => tabs.send(tabId, msg),
  };
}
