// The picture of a tile: a frame that holds the image when its URL passes the host check, and stays a
// neutral frame otherwise, or once the image fails to load. The image sends no referrer and is purely
// decorative (the tile's text names the title).

import { isShownImageUrl } from "../../core/image-urls";
import type { ElementLike } from "./dom-like";
import type { Maker } from "./rating-render";

const IMAGE_ATTRIBUTES: readonly [string, string][] = [
  ["referrerpolicy", "no-referrer"],
  ["loading", "lazy"],
  ["decoding", "async"],
  ["alt", ""],
];

function image(doc: Maker, url: string): ElementLike {
  const img = doc.createElement("img");
  img.setAttribute("src", url);
  for (const [name, value] of IMAGE_ATTRIBUTES) img.setAttribute(name, value);
  img.addEventListener("error", () => img.remove());
  return img;
}

export function artFrame(
  doc: Maker,
  url: string | undefined,
  cls: string,
): ElementLike {
  const frame = doc.createElement("div");
  frame.className = cls;
  if (url !== undefined && isShownImageUrl(url)) {
    frame.appendChild(image(doc, url));
  }
  return frame;
}
