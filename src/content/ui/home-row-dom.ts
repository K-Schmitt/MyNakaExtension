// The row keeper's ports over Naka's home page: the list is `main.nh-shell-main > div.nh-home`, « Reprendre la
// lecture » the row holding `h2#cw-title`, the carousel its `section.nh-carousel` row. The carousel is not a
// row the keeper counts: rows are counted after it, so « host 0 » means « right after the carousel ». Naka
// replaces the list node on every return to the home page, so a list's age is counted from the first sighting
// of that node. Moving the host where it already is does nothing: our own insertion snapshots as "keep", and
// the keeper cannot loop.

import type { EndTimer } from "./end-poll";
import type { KeeperPorts } from "./row-keeper";

const LIST_SELECTOR = "main.nh-shell-main > div.nh-home";
const REPRENDRE = /reprendre la lecture/i;
const DEFAULT_GUTTER_PX = 24;

type Place = {
  list: Element;
  carousel: Element | undefined;
  reprendre: Element | undefined;
};

function isReprendre(row: Element): boolean {
  return REPRENDRE.test(row.querySelector("h2")?.textContent ?? "");
}

function findReprendre(list: Element): Element | undefined {
  const rows = [...list.children];
  return (
    rows.find((row) => row.querySelector("h2#cw-title") !== null) ??
    rows.find(isReprendre)
  );
}

function placeOf(doc: Document): Place | undefined {
  const list = doc.querySelector(LIST_SELECTOR);
  if (list === null) return undefined;
  const carousel = [...list.children].find((row) =>
    row.matches("section.nh-carousel"),
  );
  return { list, carousel, reprendre: findReprendre(list) };
}

// The rows the keeper counts: those after the carousel, the whole list without one.
function rowsOf({ list, carousel }: Place): Element[] {
  const rows = [...list.children];
  return carousel === undefined ? rows : rows.slice(rows.indexOf(carousel) + 1);
}

// The left offset of a row title from the list's left edge: the gutter, which ours copies.
function gutterOf({ list, reprendre }: Place): number {
  const title =
    reprendre?.querySelector("h2") ?? list.querySelector("h2.nh-h2");
  if (title == null) return DEFAULT_GUTTER_PX;
  const offset =
    title.getBoundingClientRect().left - list.getBoundingClientRect().left;
  return Math.max(0, Math.round(offset));
}

function setGutter(host: HTMLElement, px: number): void {
  host.style.setProperty("padding-left", `${px}px`, "important");
  host.style.setProperty("padding-right", `${px}px`, "important");
}

function moveToTop(host: HTMLElement, { list, carousel }: Place): void {
  if (carousel === undefined) {
    if (list.firstElementChild !== host) list.prepend(host);
    return;
  }
  if (carousel.nextElementSibling !== host) carousel.after(host);
}

function moveHost(host: HTMLElement, place: Place, move: string): void {
  if (move === "top" || place.reprendre === undefined) {
    moveToTop(host, place);
    return;
  }
  if (place.reprendre.nextElementSibling !== host) place.reprendre.after(host);
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
      const rows = rowsOf(place);
      return {
        reprendre: place.reprendre ? rows.indexOf(place.reprendre) : -1,
        host: rows.indexOf(host),
        age: ageOf(place.list),
      };
    },
    apply(move) {
      const place = placeOf(doc);
      if (place === undefined) return;
      moveHost(host, place, move);
      setGutter(host, gutterOf(place));
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
