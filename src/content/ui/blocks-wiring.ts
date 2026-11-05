// The three rating blocks of a Naka tab, and the rules between them. Pure: the entry hands in the worker
// port, the timer, both overlays, the clock and the title lookup, and binds what this returns to the
// page's events. The end and pause blocks draw in one overlay, owned by one block at a time: the end
// block closes the pause block before it opens, and the pause block neither draws nor clears while the
// end block is shown. Every URL change closes the pause block; leaving the player closes the end block
// too, while an episode change (autoplay) keeps its card. The home panel has its own overlay.

import type { ContentIds } from "../../core/finish-event";
import type { VideoSample } from "../naka-tab";
import { createEndBlock } from "./end-block";
import type { EndTimer } from "./end-poll";
import { createHomeBlock, type HomeHandlers } from "./home-block";
import type { HomeView } from "./home-view";
import { createPauseBlock } from "./pause-block";
import type { RatingHandlers } from "./rating-render";
import type { RatingView } from "./rating-view";
import type { WorkerPort } from "./worker-port";

type Overlay<V, H> = { show(view: V, handlers: H): void; hide(): void };

export type WiringPorts = {
  port: WorkerPort;
  timer: EndTimer;
  /** The overlay over the player, shared by the end and pause blocks. */
  playerUi: Overlay<RatingView, RatingHandlers>;
  homeUi: Overlay<HomeView, HomeHandlers>;
  now(): number;
  titleOf(contentId: number): Promise<string | undefined>;
};

export function wireBlocks(ports: WiringPorts) {
  const { port, timer, playerUi, homeUi } = ports;
  const endBlock = createEndBlock({
    port,
    timer,
    show: playerUi.show,
    hide: playerUi.hide,
    opening: () => pauseBlock.close(),
  });
  const pauseBlock = createPauseBlock({
    port,
    timer,
    show: (view, handlers) => {
      if (!endBlock.isShown()) playerUi.show(view, handlers);
    },
    hide: () => {
      if (!endBlock.isShown()) playerUi.hide();
    },
    now: ports.now,
    endShown: () => endBlock.isShown(),
    titleOf: ports.titleOf,
  });
  const homeBlock = createHomeBlock({
    port,
    timer,
    show: homeUi.show,
    hide: homeUi.hide,
  });
  let playing: ContentIds | undefined;
  return {
    finished: (ids: ContentIds) => endBlock.finished(ids),
    urlChanged: (ids: ContentIds | undefined) => {
      playing = ids;
      pauseBlock.urlChanged(ports.now());
      if (ids === undefined) endBlock.leave();
    },
    pathChanged: (pathname: string) => homeBlock.route(pathname),
    paused: (sample: VideoSample) => pauseBlock.paused(sample, playing),
    resumed: () => pauseBlock.resumed(),
  };
}
