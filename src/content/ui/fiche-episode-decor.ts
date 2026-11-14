// The decoration of one episode box: an average badge for the thumb and ten stars for under the title,
// named after the SensCritique episode when it has a title. While the box's rating is on its way its stars
// are dimmed and busy; when it failed, the panel's error line sits under them until the next view without
// that outcome. Each in its own closed host that keeps the page's input events (the box's
// `button.dcf-ep-hit` starts the episode: a click meant for a star must never reach it). Drawn again only
// when what it shows changed.

import type { FicheEpisode, FicheView } from "../fiche-view";
import type { DocLike, ElementLike, ShadowRootLike } from "./dom-like";
import { episodeStarsName, outcomeLine } from "./fiche-copy";
import { type FicheHandlers, ficheStars } from "./fiche-handlers";
import { frenchAverage } from "./fiche-numbers";
import { BADGE_SHEET, EPISODE_STARS_SHEET } from "./fiche-styles";
import { NOT_RATED_LINE } from "./rating-copy";
import { ERROR_CLASS, textLine } from "./rating-render";
import { createClosedHost } from "./row-host";
import type { SeenWatch } from "./star-visibility";

type Host = { host: ElementLike; root: ShadowRootLike };

/** What a box shows of the rating sent from it. */
export type BoxWrite = { busy: boolean; line?: string };

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

export function boxWriteOf(view: FicheView, n: number): BoxWrite {
  if (view.ratedEpisode !== n) return { busy: false };
  if (view.pending === "rating") return { busy: true };
  if (view.outcome === undefined) return { busy: false };
  return { busy: false, line: outcomeLine(view.outcome, NOT_RATED_LINE) };
}

const keyOf = (
  n: number,
  { productId, average, mine, title }: FicheEpisode,
  { busy, line }: BoxWrite,
) => JSON.stringify([n, productId, average, mine, title, busy, line]);

/** What drawing a box's values needs: the maker of our elements, and the stars' visibility watch (D7). */
export type DecorPorts = {
  doc: Pick<DocLike, "createElement">;
  seen: SeenWatch;
};

function starsOf(
  { doc, seen }: DecorPorts,
  slot: object,
  n: number,
  episode: FicheEpisode,
  handlers: FicheHandlers,
  write: BoxWrite,
): ElementLike[] {
  const name =
    episode.title === undefined ? undefined : episodeStarsName(episode.title);
  const onChoose = (value: number) => handlers.rateEpisode(n, value);
  const watch = { watch: seen, slot };
  const stars = ficheStars(doc, episode.mine, onChoose, watch, name);
  if (write.busy) stars.setAttribute("aria-busy", "true");
  if (write.line === undefined) return [stars];
  return [stars, textLine(doc, write.line, ERROR_CLASS)];
}

/** Draws the episode's values in the hosts, unless they already show them. */
export function drawDecor(
  ports: DecorPorts,
  decor: EpisodeDecor,
  n: number,
  episode: FicheEpisode,
  handlers: FicheHandlers,
  write: BoxWrite,
): void {
  const key = keyOf(n, episode, write);
  if (decor.drawn?.key === key && decor.drawn.handlers === handlers) return;
  decor.drawn = { key, handlers };
  const { doc } = ports;
  decor.badge.root.replaceChildren(
    ...(episode.average === null
      ? []
      : [textLine(doc, frenchAverage(episode.average), BADGE_CLASS)]),
  );
  decor.stars.root.replaceChildren(
    ...starsOf(ports, decor, n, episode, handlers, write),
  );
}

export function takeOffDecor(decor: EpisodeDecor): void {
  decor.badge.host.remove();
  decor.stars.host.remove();
}
