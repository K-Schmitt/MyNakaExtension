// « Chercher » from the title page: the owner's own words, sent only while SensCritique found nothing, and
// never while another search or a write is on its way (one at a time). Searching is a read: its results are
// candidates the worker issued to this tab, and only a trusted click on one links it, as a choice among the
// offered candidates does. An answer that comes once the visit is over changes nothing.

import { isSearchQuery } from "../ext/fiche-messages";
import {
  contentOf,
  type FichePage,
  type FicheScope,
  forgetEnding,
} from "./fiche-page";

function canSearch(page: FichePage, query: string): boolean {
  if (page.info?.state !== "notfound" || page.pending !== undefined) {
    return false;
  }
  if (page.search?.state === "searching") return false;
  return isSearchQuery(query);
}

export async function searchTitle(
  scope: FicheScope,
  words: string,
): Promise<void> {
  const { page } = scope;
  const query = words.trim();
  const contentId = contentOf(page);
  if (contentId === undefined || !canSearch(page, query)) return;
  page.search = { query, state: "searching" };
  forgetEnding(page);
  scope.show();
  const msg = { type: "fiche-search", contentId, query } as const;
  const answer = await scope.ports.search(msg);
  if (!scope.live()) return;
  page.search =
    answer === undefined
      ? { query, state: "failed" }
      : { query, state: "done", candidates: answer.candidates };
  scope.show();
}

/** Whether the visit's last search gave this product. */
export function searchOffers(page: FichePage, productId: number): boolean {
  const { search } = page;
  if (search?.state !== "done") return false;
  return search.candidates.some((known) => known.id === productId);
}
