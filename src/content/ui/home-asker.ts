// The panel asks for the whole list, an entry's wait wants one card: this narrows the list's answer to the
// card of a key. A card the list no longer holds comes as `card: null`; no answer stays no answer.

import type { CardAnswer, CardsAnswer } from "../../sw/rating-answers";
import type { WorkerPort } from "./worker-port";

export function cardAnswerFor(
  key: string,
  cards: CardsAnswer["cards"],
): CardAnswer {
  const hit = cards.find((entry) => entry.card.key === key);
  return {
    card: hit?.card ?? null,
    pauseFromPercent: 0,
    ...(hit?.start === undefined ? {} : { start: hit.start }),
    ...(hit?.sending === undefined ? {} : { sending: hit.sending }),
  };
}

export function entryAsker(
  port: Pick<WorkerPort, "askCards">,
  key: string,
): () => Promise<CardAnswer | undefined> {
  return async () => {
    const answer = await port.askCards();
    return answer === undefined ? undefined : cardAnswerFor(key, answer.cards);
  };
}
