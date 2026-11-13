// The MAIN relay's answer to the tab's announcement of a title page visit: the events it kept for that
// title, posted again. Only a message from this window and from naka.cx is read; the events stay
// page-forgeable as before, and the worker checks them.

import { parseVisit } from "../ext/fiche-visit";
import type { PageEvent } from "../ext/messages";
import type { FicheMemory } from "./fiche-memory";

const NAKA_ORIGIN = "https://naka.cx";

type WindowMessage = { source: unknown; origin: string; data: unknown };

export function replayOnVisit(
  self: unknown,
  memory: FicheMemory,
  post: (event: PageEvent) => void,
): (ev: WindowMessage) => void {
  return (ev) => {
    if (ev.source !== self || ev.origin !== NAKA_ORIGIN) return;
    const path = parseVisit(ev.data);
    if (path === undefined) return;
    for (const event of memory.replay(path)) post(event);
  };
}
