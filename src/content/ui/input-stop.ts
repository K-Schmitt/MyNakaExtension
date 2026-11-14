// The input events a host keeps from the page: the page's own listeners (Naka's player, its rows) must not
// see a click or a key meant for our cards. Our handlers sit inside the shadow tree and run before the
// host's bubble-phase stop.

import { valuesOf } from "../../ext/field-checks";
import type { ElementLike } from "./dom-like";

type StoppedEvent =
  | "click"
  | "dblclick"
  | "auxclick"
  | "contextmenu"
  | "pointerdown"
  | "pointerup"
  | "mousedown"
  | "mouseup"
  | "touchstart"
  | "touchend"
  | "keydown"
  | "keyup"
  | "wheel";

// On the player overlay: input on the block must not reach Naka's player (a click toggles play, a double
// click fullscreen).
export const STOPPED_EVENTS = valuesOf<StoppedEvent>({
  click: true,
  dblclick: true,
  auxclick: true,
  contextmenu: true,
  pointerdown: true,
  pointerup: true,
  mousedown: true,
  mouseup: true,
  touchstart: true,
  touchend: true,
  keydown: true,
  keyup: true,
  wheel: true,
});

/** The home row lets wheel through: the page and the track must keep scrolling. */
export const ROW_STOPPED_EVENTS: readonly string[] = STOPPED_EVENTS.filter(
  (type) => type !== "wheel",
);

/** A text field's own events, kept from the page too: its typing must not reach Naka's shortcuts. */
export const FIELD_STOPPED_EVENTS = valuesOf<
  "keypress" | "beforeinput" | "input"
>({
  keypress: true,
  beforeinput: true,
  input: true,
});

export function stopAtHost(host: ElementLike, types: readonly string[]): void {
  for (const type of types) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }
}
