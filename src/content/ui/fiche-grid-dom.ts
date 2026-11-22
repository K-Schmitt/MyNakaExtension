// The title page's episode grid in the real document: its rows (`li.nh-ep-row` inside `ol.nh-list` only, so a
// row elsewhere on the page never gets the shown season's stars) for the decorations, the season its dropdown
// names, whether the grid is there, which boxes are on screen. Read only: the only writes are our own hosts,
// put in a box's thumb and after its title.

import type { FichePorts } from "../fiche-ports";
import { badgeInsertOffset, type ThumbLayout } from "./fiche-badge-place";
import type { EpisodeBox } from "./fiche-episodes";
import { episodeNumber, seasonNumber } from "./fiche-numbers";
import { visibleFirstOrder } from "./fiche-visible-order";

const BOX = "ol.nh-list > li.nh-ep-row";
const CODE = "span.nh-ep-num";
const THUMB = "span.nh-ep-thumb";
const TITLE = "span.nh-row-title";
const GRID = BOX;
const VU = "button.nh-ep-vu";
const VU_OFF = "is-off";
const SEASON_DROPDOWN = 'button.nh-select-trigger[aria-label="Saison"]';

const layoutOf = (thumb: Element, host: HTMLElement): ThumbLayout => ({
  holdsBadge: host.parentNode === thumb,
  rect: () => thumb.getBoundingClientRect(),
  children: () => [...thumb.children].map((c) => c.getBoundingClientRect()),
});

function placeBadge(box: Element, host: HTMLElement): void {
  const thumb = box.querySelector(THUMB);
  const right = badgeInsertOffset(
    thumb === null ? undefined : layoutOf(thumb, host),
  );
  if (thumb === null || right === undefined) return;
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
    title: () => box.querySelector(TITLE)?.textContent,
    placeBadge: (host) => placeBadge(box, host as unknown as HTMLElement),
    placeStars: (host) => placeStars(box, host as unknown as HTMLElement),
  };
}

export function episodeBoxes(doc: Document): EpisodeBox[] {
  return [...doc.querySelectorAll(BOX)].map(boxOf);
}

/** The season Naka's dropdown names: null without a dropdown, undefined when it names none (« Spéciaux »). */
export function dropdownSeason(
  doc: Pick<Document, "querySelector">,
): number | null | undefined {
  const dropdown = doc.querySelector(SEASON_DROPDOWN);
  return dropdown === null ? null : seasonNumber(dropdown.textContent);
}

/** The slice of an episode row's « Vu » button read and clicked: a real `button` has all of it. */
type VuButton = {
  classList: { contains(name: string): boolean };
  click(): void;
};

function vuButtonOf(
  doc: Pick<Document, "querySelectorAll">,
  episode: number,
): VuButton | null {
  for (const row of doc.querySelectorAll(BOX)) {
    const code = row.querySelector(CODE)?.textContent;
    if (episodeNumber(code) === episode)
      return row.querySelector<HTMLElement>(VU);
  }
  return null;
}

/** The row's « Vu » button of this episode: undefined without it, else whether it is lit (no `is-off`). */
export function episodeVuState(
  doc: Pick<Document, "querySelectorAll">,
  episode: number,
): boolean | undefined {
  const button = vuButtonOf(doc, episode);
  return button === null ? undefined : !button.classList.contains(VU_OFF);
}

/** One click on this episode's « Vu » button when it is off; a lit button or none gets nothing. */
export function clickEpisodeVu(
  doc: Pick<Document, "querySelectorAll">,
  episode: number,
): void {
  const button = vuButtonOf(doc, episode);
  if (button?.classList.contains(VU_OFF)) button.click();
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
    shownSeason: () => dropdownSeason(doc) ?? undefined,
    hasEpisodeGrid: () => doc.querySelector(GRID) !== null,
    visibleFirst(numbers) {
      const height = viewportHeight();
      const visible = [...doc.querySelectorAll(BOX)]
        .filter((box) => onScreen(box, height))
        .map((box) => episodeNumber(box.querySelector(CODE)?.textContent));
      return visibleFirstOrder(numbers, visible);
    },
  };
}
