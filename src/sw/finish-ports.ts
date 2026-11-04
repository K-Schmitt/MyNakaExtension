// Builds the FinishPorts of ONE job, and the FinishEvent of a `finished` message. The message comes from
// the Naka page, which a page script can forge: it brings ids only. The title and the kind of content
// come from Naka's catalogue (contentById), never from the message.

import type { FinishedMessage } from "../content/playback-tracker";
import { nakaToTitled } from "../core/adapt-titles";
import type { FinishEvent, FinishPorts } from "../core/finish-handler";
import type { Store } from "../ext/store";
import type { NakaItem } from "../naka/naka-client";
import type { ScClient } from "../sc/sc-client";
import { withBreaker } from "./circuit-breaker";
import { type SiteLimiters, searchScBoth } from "./read-ports";

export type FinishPortDeps = {
  sc: ScClient;
  limiters: SiteLimiters;
  store: Store;
  today: () => string;
};

export function buildFinishPorts(deps: FinishPortDeps): FinishPorts {
  const { sc, limiters, store } = deps;
  return {
    searchSc: withBreaker((q: string) => searchScBoth(sc, limiters.sc, q)),
    productState: withBreaker((id: number) => sc.productState(id)),
    unwish: withBreaker((id: number) => sc.unwish(id)),
    markDone: withBreaker((id: number, date: string) => sc.markDone(id, date)),
    seasonInfo: withBreaker((id: number, season: number) =>
      sc.seasonInfo(id, season),
    ),
    today: deps.today,
    load: () => store.loadState(),
    save: (state) => store.saveState(state),
  };
}

// A film has no season or episode. A series needs both: without them the page marked the whole series,
// which never completes a viewing.
function contextOf(
  item: NakaItem,
  msg: FinishedMessage,
): FinishEvent["naka"] | undefined {
  const { contentId, season, episode } = msg;
  if (item.mediaType === "movie") {
    if (season !== undefined || episode !== undefined) return undefined;
    return { contentId, mediaType: "movie" };
  }
  if (season === undefined || episode === undefined) return undefined;
  return { contentId, mediaType: "tv", season, episode };
}

// undefined when Naka does not know the content, or when its kind does not fit the message.
export async function finishEventOf(
  msg: FinishedMessage,
  read: (id: number) => Promise<NakaItem | undefined>,
): Promise<FinishEvent | undefined> {
  const item = await read(msg.contentId);
  if (item === undefined) return undefined;
  const naka = contextOf(item, msg);
  if (naka === undefined) return undefined;
  return {
    source: msg.source,
    progress: msg.progress,
    naka,
    titled: nakaToTitled(item),
  };
}
