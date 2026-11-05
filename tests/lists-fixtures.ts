// The worker's `page-lists` answers, as the page tests feed them.

import type {
  AmbiguityOffer,
  PageListsAnswer,
  PageQuestion,
  RemovalOffer,
  UnlinkedOffer,
} from "../src/sw/question-offers";

export const NB = "\u202F";

export const AMBIGUITY: AmbiguityOffer & { hidden: boolean } = {
  kind: "ambiguity",
  key: "ambiguity:naka:7",
  side: "naka",
  id: 7,
  title: "Alien",
  candidates: [
    { id: 70, title: "Alien", year: 1979, type: "film" },
    { id: 71, title: "Aliens", year: 1986, type: "film" },
  ],
  hidden: false,
};

export const REMOVAL: RemovalOffer & { hidden: boolean } = {
  kind: "removal",
  key: "removal:sc:3:30",
  removeFrom: "sc",
  pair: { nakaId: 3, scId: 30 },
  title: "Heat",
  hidden: true,
};

export const LEGACY: Extract<PageQuestion, { kind: "legacy" }> = {
  kind: "legacy",
  key: "ambiguity:naka:9",
  side: "naka",
  id: 9,
};

export const UNLINKED_NAKA: UnlinkedOffer = {
  key: "link:naka:5",
  side: "naka",
  id: 5,
  title: "Dune",
  reason: "no-match",
};

export const UNLINKED_SC: UnlinkedOffer = {
  key: "link:sc:60",
  side: "sc",
  id: 60,
  title: "",
  reason: "none-chosen",
};

export const LISTS: PageListsAnswer = {
  questions: [AMBIGUITY, REMOVAL, LEGACY],
  unlinked: [UNLINKED_NAKA, UNLINKED_SC],
};
