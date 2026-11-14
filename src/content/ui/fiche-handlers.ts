// What the title page blocks call on a trusted click: the controller's inputs, which check the rest.

import type { FicheController } from "../fiche-controller";
import type { DocLike, ElementLike } from "./dom-like";
import { type Star, starRater } from "./star-rater";

export type FicheHandlers = Pick<
  FicheController,
  | "rateTitle"
  | "confirmSeries"
  | "cancelSeries"
  | "rateEpisode"
  | "link"
  | "undo"
  | "remove"
>;

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Ten stars (hover preview on), the owner's rating marked once known; `name` names them (« Note » without). */
export function ficheStars(
  doc: Pick<DocLike, "createElement">,
  mine: number | null | undefined,
  onChoose: (value: number) => void,
  name?: string,
): ElementLike {
  const stars: Star[] = VALUES.map((value) => ({
    value,
    marked: value === mine,
  }));
  return starRater(doc, stars, onChoose, name, true);
}
