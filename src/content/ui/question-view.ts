// What a question looks like, whatever draws it: the Naka block and the status page share it. Pure: an
// offer in, a view out. A title goes in as text; the draw puts it in with textContent.

import { thumbUrl, wideUrl } from "../../core/image-urls";
import type { TitleImage } from "../../core/title-image";
import type { QuestionOffer } from "../../sw/question-offers";
import {
  ambiguityHeading,
  candidateLabel,
  KEEP_LABEL,
  NONE_LABEL,
  removalHeading,
  removalQuestion,
  removeLabel,
  UNKNOWN_TITLE,
} from "./question-copy";

export type QuestionChoice =
  | { kind: "candidate"; id: number }
  | { kind: "none" }
  | { kind: "remove" }
  | { kind: "keep" };
export type QuestionAction = "plus-tard" | "ecarter" | "fermer";
export type QuestionView = {
  heading: string;
  question?: string;
  /** The title's wide image (removals), as a URL; checked again when drawn. */
  image?: string;
  choices: { choice: QuestionChoice; label: string; image?: string }[];
  actions: QuestionAction[];
  sending?: true;
  notice?: string;
  error?: string;
};

const titled = (title: string): string =>
  title === "" ? UNKNOWN_TITLE : title;

const withImage = (url: string | undefined): { image?: string } =>
  url === undefined ? {} : { image: url };

const imageOfTitle = (image?: TitleImage) => withImage(wideUrl(image));

export function questionView(
  offer: QuestionOffer,
  actions: QuestionAction[],
): QuestionView {
  if (offer.kind === "removal") {
    return {
      heading: removalHeading(offer.removeFrom, titled(offer.title)),
      question: removalQuestion(offer.removeFrom),
      ...imageOfTitle(offer.image),
      choices: [
        { choice: { kind: "remove" }, label: removeLabel(offer.removeFrom) },
        { choice: { kind: "keep" }, label: KEEP_LABEL },
      ],
      actions,
    };
  }
  return {
    heading: ambiguityHeading(offer.side, titled(offer.title)),
    choices: [
      ...offer.candidates.map((c) => ({
        choice: { kind: "candidate", id: c.id } as const,
        label: candidateLabel(c),
        ...withImage(thumbUrl(c.image)),
      })),
      { choice: { kind: "none" }, label: NONE_LABEL },
    ],
    actions,
  };
}
