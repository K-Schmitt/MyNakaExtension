// The decoration of one episode box: an average badge for the thumb and ten stars for under the title,
// each in its own closed host that keeps the page's input events (the box's `button.dcf-ep-hit` starts the
// episode: a click meant for a star must never reach it). Drawn again only when what it shows changed.

import type { FicheEpisode } from "../fiche-view";
import type { DocLike, ElementLike, ShadowRootLike } from "./dom-like";
import { type FicheHandlers, ficheStars } from "./fiche-handlers";
import { frenchAverage } from "./fiche-numbers";
import { BADGE_SHEET, EPISODE_STARS_SHEET } from "./fiche-styles";
import { textLine } from "./rating-render";
import { createClosedHost } from "./row-host";

type Host = { host: ElementLike; root: ShadowRootLike };

export type EpisodeDecor = {
  badge: Host;
  stars: Host;
  /** What the hosts show now: the episode, its values and the handlers they call. */
  drawn?: { key: string; handlers: FicheHandlers };
};

// Above Naka's `button.dcf-ep-hit`, which covers the whole box.
const ABOVE_HIT = ["position: absolute", "z-index: 5"];
const BADGE_DECLARATIONS = [
  "all: initial",
  ...ABOVE_HIT,
  "top: 8px",
  "right: 8px",
  "display: block",
];
const STARS_DECLARATIONS = [
  "all: initial",
  "display: block",
  "position: relative",
  "z-index: 5",
  "margin: 4px 0 0",
];
const BADGE_CLASS = "mn-badge";

export function createDecor(doc: Pick<DocLike, "createElement">): EpisodeDecor {
  return {
    badge: createClosedHost(doc, "span", BADGE_DECLARATIONS, BADGE_SHEET),
    stars: createClosedHost(
      doc,
      "div",
      STARS_DECLARATIONS,
      EPISODE_STARS_SHEET,
    ),
  };
}

const keyOf = (n: number, { productId, average, mine }: FicheEpisode) =>
  `${n}|${productId}|${average}|${mine}`;

/** Draws the episode's values in the hosts, unless they already show them. */
export function drawDecor(
  doc: Pick<DocLike, "createElement">,
  decor: EpisodeDecor,
  n: number,
  episode: FicheEpisode,
  handlers: FicheHandlers,
): void {
  const key = keyOf(n, episode);
  if (decor.drawn?.key === key && decor.drawn.handlers === handlers) return;
  decor.drawn = { key, handlers };
  decor.badge.root.replaceChildren(
    ...(episode.average === null
      ? []
      : [textLine(doc, frenchAverage(episode.average), BADGE_CLASS)]),
  );
  decor.stars.root.replaceChildren(
    ficheStars(doc, episode.mine, (value) => handlers.rateEpisode(n, value)),
  );
}

export function takeOffDecor(decor: EpisodeDecor): void {
  decor.badge.host.remove();
  decor.stars.host.remove();
}
