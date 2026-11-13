// What an issued product stands for on its title page, checked before each write: a rating names its
// target (the film, the series, one of its episodes), a link names a candidate of the answer's choice.

import type { FicheTarget } from "../ext/fiche-messages";
import type { FichePage } from "./fiche-registry-schema";

export type FicheRole = FicheTarget | "candidate";

const TITLE_TYPE = { film: "film", série: "serie" } as const;

/** Issued to the page under any role: what a read may name. */
export function isIssued(page: FichePage, productId: number): boolean {
  return (
    page.title?.productId === productId ||
    page.candidates.includes(productId) ||
    page.episodes.includes(productId)
  );
}

/** Issued to the page as `role`: the title of that type, an episode other than the title, a candidate. */
export function standsFor(
  page: FichePage,
  productId: number,
  role: FicheRole,
): boolean {
  switch (role) {
    case "film":
    case "série":
      return (
        page.title?.productId === productId &&
        page.title.type === TITLE_TYPE[role]
      );
    case "épisode":
      return (
        page.title?.productId !== productId && page.episodes.includes(productId)
      );
    case "candidate":
      return page.candidates.includes(productId);
  }
}
