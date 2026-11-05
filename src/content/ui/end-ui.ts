// Where the end and pause blocks draw, a rating or a question: the overlay root, made on the first show so that a page without a block gets
// no element from the extension. Before every draw the host is put back if the page removed it.

import type { DocLike } from "./dom-like";
import { createOverlayRoot } from "./overlay-root";
import { type QuestionHandlers, renderQuestion } from "./question-render";
import type { QuestionView } from "./question-view";
import { type RatingHandlers, renderRating } from "./rating-render";
import type { RatingView } from "./rating-view";

export function createEndUi(doc: DocLike) {
  let overlay: ReturnType<typeof createOverlayRoot> | undefined;
  return {
    show(view: RatingView, handlers: RatingHandlers): void {
      overlay ??= createOverlayRoot(doc);
      overlay.attach();
      renderRating(doc, overlay.root, view, handlers);
    },
    showQuestion(view: QuestionView, handlers: QuestionHandlers): void {
      overlay ??= createOverlayRoot(doc);
      overlay.attach();
      renderQuestion(doc, overlay.root, view, handlers);
    },
    hide(): void {
      overlay?.root.replaceChildren();
    },
  };
}
