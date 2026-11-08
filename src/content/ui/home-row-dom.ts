// The row keeper's ports over Naka's home page: the list is `.discover-page .dc-sections`, « Reprendre la
// lecture » its first row whose h2 says so. Naka replaces the list node on every return to the home page,
// so a list's age is counted from the first sighting of that node. Moving the host where it already is
// does nothing: our own insertion snapshots as "keep", and the keeper cannot loop.

import type { EndTimer } from "./end-poll";
import type { KeeperPorts } from "./row-keeper";

const LIST_SELECTOR = ".discover-page .dc-sections";
const REPRENDRE = /reprendre la lecture/i;
const DEFAULT_GUTTER_PX = 24;

type Place = { list: Element; reprendre: Element | undefined };

function placeOf(doc: Document): Place | undefined {
  const list = doc.querySelector(LIST_SELECTOR);
  if (list === null) return undefined;
  const reprendre = [...list.children].find((row) =>
    REPRENDRE.test(row.querySelector("h2")?.textContent ?? ""),
  );
  return { list, reprendre };
}

// The left offset of the « Reprendre » title inside its row: the row's gutter, which ours copies.
function gutterOf(reprendre: Element | undefined): number {
  const title = reprendre?.querySelector("h2");
  if (reprendre === undefined || title == null) return DEFAULT_GUTTER_PX;
  const offset =
    title.getBoundingClientRect().left - reprendre.getBoundingClientRect().left;
  return Math.max(0, Math.round(offset));
}

function setGutter(host: HTMLElement, px: number): void {
  host.style.setProperty("padding-left", `${px}px`, "important");
  host.style.setProperty("padding-right", `${px}px`, "important");
}

function moveHost(host: HTMLElement, { list, reprendre }: Place): void {
  if (reprendre === undefined) {
    if (list.firstElementChild !== host) list.prepend(host);
    return;
  }
  if (reprendre.nextElementSibling !== host) reprendre.after(host);
}

export function createRowPorts(
  doc: Document,
  host: HTMLElement,
  timer: EndTimer,
  now: () => number,
): KeeperPorts {
  const firstSeen = new WeakMap<Element, number>();
  const ageOf = (list: Element): number => {
    const seen = firstSeen.get(list) ?? now();
    firstSeen.set(list, seen);
    return now() - seen;
  };
  return {
    snapshot() {
      const place = placeOf(doc);
      if (place === undefined) return undefined;
      const rows = [...place.list.children];
      return {
        reprendre: place.reprendre ? rows.indexOf(place.reprendre) : -1,
        host: rows.indexOf(host),
        age: ageOf(place.list),
      };
    },
    apply(move) {
      const place = placeOf(doc);
      if (place === undefined) return;
      const target =
        move === "top" ? { ...place, reprendre: undefined } : place;
      moveHost(host, target);
      setGutter(host, gutterOf(place.reprendre));
    },
    detach() {
      host.remove();
    },
    watch(onChange) {
      const observer = new MutationObserver(() => onChange());
      observer.observe(doc.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    timer,
  };
}
