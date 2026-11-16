// The candidates the worker offered the title page, step 7's (« Relier à SensCritique ») or a search's: one
// button each, its small poster and its label, in a list; a trusted click links it while `watch` says it
// visible (D7): a link can run the finish that waited on the title.

import { thumbUrl } from "../../core/image-urls";
import type { QuestionCandidate } from "../../core/state";
import { candidateButton } from "./candidate-button";
import type { ElementLike } from "./dom-like";
import type { RowWatch } from "./draw-watch";
import type { FicheHandlers } from "./fiche-handlers";
import { candidateLabel } from "./question-copy";
import { type Maker, row } from "./rating-render";

const CHOICES_CLASS = "mn-choices";

function candidateChoice(
  doc: Maker,
  candidate: QuestionCandidate,
  handlers: Pick<FicheHandlers, "link">,
  watch: RowWatch,
): ElementLike {
  const image = thumbUrl(candidate.image);
  return candidateButton(
    doc,
    {
      choice: { kind: "candidate", id: candidate.id },
      label: candidateLabel(candidate),
      ...(image === undefined ? {} : { image }),
    },
    { onChoose: () => handlers.link(candidate.id) },
    watch,
  );
}

export function candidateChoices(
  doc: Maker,
  candidates: readonly QuestionCandidate[],
  handlers: Pick<FicheHandlers, "link">,
  watch: RowWatch,
): ElementLike {
  return row(
    doc,
    candidates.map((c) => candidateChoice(doc, c, handlers, watch)),
    CHOICES_CLASS,
  );
}
