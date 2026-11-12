// The title page's episode grid in the real document: its boxes (`div.dcf-ep`) for the decorations, the
// season its dropdown names, whether the grid is there, which boxes are on screen. Read only: the only
// writes are our own hosts, put in a box's thumb and after its title.

import type { FichePorts } from "../fiche-ports";
import { badgeRight } from "./fiche-badge-place";
import type { EpisodeBox } from "./fiche-episodes";
import { episodeNumber, seasonNumber } from "./fiche-numbers";

const BOX = "div.dcf-ep";
const CODE = "span.dcf-ep-code";
const THUMB = "div.dcf-ep-thumb";
const TITLE = "p.dcf-ep-title";
const GRID = "div.dcf-ep-grid";
const SEASON_DROPDOWN = "button.dcf-season-dd";

function placeBadge(box: Element, host: HTMLElement): void {
  const thumb = box.querySelector(THUMB);
  if (thumb === null || host.parentNode === thumb) return;
  const others = [...thumb.children].map((c) => c.getBoundingClientRect());
  const right = badgeRight(thumb.getBoundingClientRect(), others);
  host.style.setProperty("right", `${right}px`, "important");
  thumb.append(host);
}

function placeStars(box: Element, host: HTMLElement): void {
  const title = box.querySelector(TITLE);
  if (title !== null && title.nextElementSibling !== host) title.after(host);
}

// The hosts are elements the real document made: real elements, which the binding can place.
function boxOf(box: Element): EpisodeBox {
  return {
    key: box,
    code: () => box.querySelector(CODE)?.textContent,
    placeBadge: (host) => placeBadge(box, host as unknown as HTMLElement),
    placeStars: (host) => placeStars(box, host as unknown as HTMLElement),
  };
}

export function episodeBoxes(doc: Document): EpisodeBox[] {
  return [...doc.querySelectorAll(BOX)].map(boxOf);
}

const onScreen = (box: Element, height: number): boolean => {
  const rect = box.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < height;
};

export function gridPorts(
  doc: Document,
  viewportHeight: () => number,
): Pick<FichePorts, "shownSeason" | "hasEpisodeGrid" | "visibleFirst"> {
  return {
    shownSeason: () =>
      seasonNumber(doc.querySelector(SEASON_DROPDOWN)?.textContent),
    hasEpisodeGrid: () => doc.querySelector(GRID) !== null,
    visibleFirst(numbers) {
      const height = viewportHeight();
      const visible = [...doc.querySelectorAll(BOX)]
        .filter((box) => onScreen(box, height))
        .map((box) => episodeNumber(box.querySelector(CODE)?.textContent));
      const first = numbers.filter((n) => visible.includes(n));
      return [...first, ...numbers.filter((n) => !first.includes(n))];
    },
  };
}
