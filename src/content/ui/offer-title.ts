// The title of an offer the worker stored without one (a question asked before 4b, a removal whose title
// the sync did not read). A Naka id is read with the tab's own client; a SensCritique-side offer has a
// stored title or none, and a miss stays "" (the view then says « (titre inconnu) »). A read that fails
// or does not answer within TITLE_WAIT_MS is a miss: the panel never waits longer on a title.

import type { QuestionOffer } from "../../sw/question-offers";
import type { EndTimer } from "./end-poll";

export const TITLE_WAIT_MS = 2000;

type TitleOf = (contentId: number) => Promise<string | undefined>;

// The Naka content the offer is about, when the tab can name it.
function nakaIdOf(offer: QuestionOffer): number | undefined {
  if (offer.kind === "removal") return offer.pair.nakaId;
  return offer.side === "naka" ? offer.id : undefined;
}

export function titleOrNothing(
  titleOf: TitleOf,
  timer: EndTimer,
  id: number,
): Promise<string> {
  return new Promise((resolve) => {
    const handle = timer.set(() => resolve(""), TITLE_WAIT_MS);
    const done = (title: string): void => {
      timer.clear(handle);
      resolve(title);
    };
    // Resolving twice is harmless: the first settles.
    Promise.resolve()
      .then(() => titleOf(id))
      .then(
        (title) => done(title ?? ""),
        () => done(""),
      );
  });
}

export async function titledOffer(
  titleOf: TitleOf,
  timer: EndTimer,
  offer: QuestionOffer,
): Promise<QuestionOffer> {
  const id = nakaIdOf(offer);
  if (offer.title !== "" || id === undefined) return offer;
  return { ...offer, title: await titleOrNothing(titleOf, timer, id) };
}
