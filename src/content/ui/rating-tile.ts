// A rating card of the home row as a tile: the title's picture on top, then the player block's lines,
// the ten stars and « Ignorer » in small; the série confirmation (warning, « Envoyer », « Annuler »)
// stays in the tile. Texts go through textContent; every button acts on a trusted click only, the stars
// and the confirmation only while `watch` says their row counts.

import type { ElementLike } from "./dom-like";
import type { RowWatch } from "./draw-watch";
import { ACTION_LABELS } from "./rating-copy";
import {
  button,
  confirmRow,
  type Maker,
  type RatingHandlers,
  ratingLines,
  row,
} from "./rating-render";
import type { RatingView } from "./rating-view";
import { starRater } from "./star-rater";
import { artFrame } from "./tile-art";
import {
  ART_CLASS,
  POSTER_TILE_CLASS,
  SMALL_BUTTON_CLASS,
  tile,
} from "./tile-shell";

function choosing(
  doc: Maker,
  view: RatingView,
  handlers: RatingHandlers,
  watch: RowWatch,
): ElementLike[] {
  const actions = view.actions.map((action) =>
    button(doc, ACTION_LABELS[action], SMALL_BUTTON_CLASS, () =>
      handlers.onAction(action),
    ),
  );
  return [
    ...(view.choices.length > 0
      ? [starRater(doc, view.choices, handlers.onChoose, { watch })]
      : []),
    ...(actions.length > 0 ? [row(doc, actions)] : []),
  ];
}

export function buildRatingTile(
  doc: Maker,
  view: RatingView,
  image: string | undefined,
  handlers: RatingHandlers,
  watch: RowWatch,
): ElementLike {
  const controls =
    view.confirm === true
      ? [confirmRow(doc, handlers, watch)]
      : choosing(doc, view, handlers, watch);
  return tile(
    doc,
    artFrame(doc, image, ART_CLASS),
    [...ratingLines(doc, view), ...controls],
    POSTER_TILE_CLASS,
  );
}
