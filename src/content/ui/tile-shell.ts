// The shape every tile of the home row shares: an optional picture frame on top, then a body that holds
// the tile's lines and controls. All tiles are the same size (the row's stylesheet fixes it).

import type { ElementLike } from "./dom-like";
import type { Maker } from "./rating-render";

export const ART_CLASS = "mn-art";
export const SMALL_BUTTON_CLASS = "mn-btn mn-btn--small";
const TILE_CLASS = "mn-tile";
const TILE_BODY_CLASS = "mn-tile-body";
export const POSTER_TILE_CLASS = "mn-tile--poster";

/** `variant` adds a modifier class, e.g. the rating tile's full-height poster. */
export function tile(
  doc: Maker,
  art: ElementLike | undefined,
  parts: ElementLike[],
  variant?: string,
): ElementLike {
  const el = doc.createElement("div");
  el.className =
    variant === undefined ? TILE_CLASS : `${TILE_CLASS} ${variant}`;
  if (art !== undefined) el.appendChild(art);
  const body = doc.createElement("div");
  body.className = TILE_BODY_CLASS;
  for (const part of parts) body.appendChild(part);
  el.appendChild(body);
  return el;
}
