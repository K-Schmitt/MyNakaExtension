// The episode boxes of the shown season: each `div.dcf-ep` whose code (`span.dcf-ep-code`) ends with the
// number of an episode SensCritique lists, and names no other season, gets its badge and its stars; any other
// box is left bare, never given a neighbour's values. Naka redraws its grid (a season change can keep the
// boxes and rewrite their codes), so every change of the page runs the pass again while there are episodes
// to show.

import type { FicheView } from "../fiche-view";
import type { DocLike, ElementLike } from "./dom-like";
import {
  createDecor,
  drawDecor,
  type EpisodeDecor,
  takeOffDecor,
} from "./fiche-episode-decor";
import type { FicheHandlers } from "./fiche-handlers";
import { codeSeason, episodeNumber } from "./fiche-numbers";

export type EpisodeBox = {
  /** The box element: its decoration is kept per box. */
  key: object;
  /** The text of the box's `span.dcf-ep-code`, read at each pass. */
  code(): string | null | undefined;
  /** Puts the host in the thumb's top-right corner, left of a control of Naka's there; idempotent. */
  placeBadge(host: ElementLike): void;
  /** Puts the host right under `p.dcf-ep-title`; idempotent. */
  placeStars(host: ElementLike): void;
};

export type FicheEpisodesPorts = {
  doc: Pick<DocLike, "createElement">;
  boxes(): EpisodeBox[];
  watch(onChange: () => void): () => void;
};

type Shown = { view: FicheView; handlers: FicheHandlers };

// A code that names a season must name the shown one: a box Naka has not redrawn yet for the new season
// stays bare rather than carry the new season's episode. A code without a season is read as before.
function isOtherSeason(
  code: string | null | undefined,
  view: FicheView,
): boolean {
  const season = codeSeason(code);
  return season !== undefined && season !== view.season;
}

export function createFicheEpisodes(ports: FicheEpisodesPorts): {
  draw(view: FicheView, handlers: FicheHandlers): void;
  clear(): void;
} {
  const decors = new WeakMap<object, EpisodeDecor>();
  let shown: Shown | undefined;
  let unwatch: (() => void) | undefined;

  function decorate(box: EpisodeBox, { view, handlers }: Shown): void {
    const code = box.code();
    const n = isOtherSeason(code, view) ? undefined : episodeNumber(code);
    const episode = n === undefined ? undefined : view.episodes.get(n);
    const known = decors.get(box.key);
    if (n === undefined || episode === undefined) {
      if (known !== undefined) takeOffDecor(known);
      return;
    }
    const decor = known ?? createDecor(ports.doc);
    decors.set(box.key, decor);
    drawDecor(ports.doc, decor, n, episode, handlers);
    if (episode.average === null) decor.badge.host.remove();
    else box.placeBadge(decor.badge.host);
    box.placeStars(decor.stars.host);
  }

  function pass(): void {
    if (shown === undefined) return;
    for (const box of ports.boxes()) decorate(box, shown);
  }

  function stopWatching(): void {
    unwatch?.();
    unwatch = undefined;
  }

  return {
    draw(view, handlers) {
      shown = { view, handlers };
      pass();
      if (view.episodes.size === 0) stopWatching();
      else unwatch ??= ports.watch(pass);
    },
    clear() {
      stopWatching();
      shown = undefined;
      for (const box of ports.boxes()) {
        const decor = decors.get(box.key);
        if (decor !== undefined) takeOffDecor(decor);
      }
    },
  };
}
