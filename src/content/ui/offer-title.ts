// The title of an offer the worker stored without one (a question asked before 4b, a removal whose title
// the sync did not read). A Naka id is read with the tab's own client; a SensCritique-side offer has a
// stored title or none, and a miss stays "" (the view then says « (titre inconnu) »).

import type { QuestionOffer } from "../../sw/question-offers";

type TitleOf = (contentId: number) => Promise<string | undefined>;

// The Naka content the offer is about, when the tab can name it.
function nakaIdOf(offer: QuestionOffer): number | undefined {
  if (offer.kind === "removal") return offer.pair.nakaId;
  return offer.side === "naka" ? offer.id : undefined;
}

async function titleOrNothing(titleOf: TitleOf, id: number): Promise<string> {
  try {
    return (await titleOf(id)) ?? "";
  } catch {
    return "";
  }
}

export async function titledOffer(
  titleOf: TitleOf,
  offer: QuestionOffer,
): Promise<QuestionOffer> {
  const id = nakaIdOf(offer);
  if (offer.title !== "" || id === undefined) return offer;
  return { ...offer, title: await titleOrNothing(titleOf, id) };
}
