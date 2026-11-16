// Where the end and pause blocks draw, a rating or a question: the overlay root, made on the first show so that a page without a block gets
// no element from the extension. Before every draw the host is put back if the page removed it. The stars
// and the series confirmation are guarded by D7 (`seen`): each draw stops watching the rows of the last one,
// and so does a hide (no row stays observed once the block is gone).

import { BLOCK_SHEET } from "./block-styles";
import type { DocLike } from "./dom-like";
import { createDrawWatch } from "./draw-watch";
import { createOverlayRoot } from "./overlay-root";
import { type QuestionHandlers, renderQuestion } from "./question-render";
import type { QuestionView } from "./question-view";
import { type RatingHandlers, renderRating } from "./rating-render";
import type { RatingView } from "./rating-view";
import type { ReleasableWatch } from "./star-visibility";

export function createEndUi(doc: DocLike, seen: ReleasableWatch) {
  let overlay: ReturnType<typeof createOverlayRoot> | undefined;
  const drawn = createDrawWatch(seen);
  return {
    show(view: RatingView, handlers: RatingHandlers): void {
      overlay ??= createOverlayRoot(doc, "top-right", BLOCK_SHEET);
      overlay.attach();
      drawn.clear();
      renderRating(doc, overlay.root, view, handlers, drawn.watch);
    },
    showQuestion(view: QuestionView, handlers: QuestionHandlers): void {
      overlay ??= createOverlayRoot(doc, "top-right", BLOCK_SHEET);
      overlay.attach();
      drawn.clear();
      renderQuestion(doc, overlay.root, view, handlers);
    },
    hide(): void {
      drawn.clear();
      overlay?.root.replaceChildren();
    },
  };
}
