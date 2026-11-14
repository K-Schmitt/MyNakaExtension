// The step 7 states the actions host shows instead of, or under, its buttons: loading, the candidates to
// link with their posters, « Pas trouvé », a series' confirmation, the write's and the season's error lines.
// Texts go through textContent; every button acts on a trusted click only.

import { thumbUrl } from "../../core/image-urls";
import type { QuestionCandidate } from "../../core/state";
import type { FicheView } from "../fiche-view";
import type { ElementLike } from "./dom-like";
import {
  INFO_FAILED_LINE,
  LINK_FAILED_LINE,
  LINK_HEADING,
  LINKING_LINE,
  LOADING_LINE,
  NOT_FOUND_LINE,
  outcomeLine,
  SERIES_CONFIRM,
  seasonFailedLine,
} from "./fiche-copy";
import type { FicheHandlers } from "./fiche-handlers";
import { candidateLabel } from "./question-copy";
import { candidateButton } from "./question-tile";
import {
  confirmRow,
  ERROR_CLASS,
  type Maker,
  row,
  TITLE_CLASS,
  textLine,
  WARNING_CLASS,
} from "./rating-render";

const CHOICES_CLASS = "mn-choices";

/** The line of the last write's ending; `failed` names what an unanswered rating or link was. */
export function outcomeLines(doc: Maker, view: FicheView, failed: string) {
  const { outcome } = view;
  if (outcome === undefined) return [];
  return [textLine(doc, outcomeLine(outcome, failed), ERROR_CLASS)];
}

export function seasonLines(doc: Maker, view: FicheView): ElementLike[] {
  if (view.seasonFailed !== true || view.season === undefined) return [];
  return [textLine(doc, seasonFailedLine(view.season), ERROR_CLASS)];
}

export function seriesConfirm(
  doc: Maker,
  handlers: FicheHandlers,
): ElementLike[] {
  return [
    textLine(doc, SERIES_CONFIRM, WARNING_CLASS),
    confirmRow(doc, {
      onConfirm: (send) =>
        send ? handlers.confirmSeries() : handlers.cancelSeries(),
    }),
  ];
}

function candidateChoice(
  doc: Maker,
  candidate: QuestionCandidate,
  handlers: FicheHandlers,
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
  );
}

function linkParts(
  doc: Maker,
  view: FicheView,
  candidates: readonly QuestionCandidate[],
  handlers: FicheHandlers,
): ElementLike[] {
  const choices =
    view.pending === "link"
      ? textLine(doc, LINKING_LINE)
      : row(
          doc,
          candidates.map((c) => candidateChoice(doc, c, handlers)),
          CHOICES_CLASS,
        );
  return [
    textLine(doc, LINK_HEADING, TITLE_CLASS),
    choices,
    ...outcomeLines(doc, view, LINK_FAILED_LINE),
  ];
}

/** What shows while the title has no product to rate: loading, its failure, the candidates, « Pas trouvé ». */
export function rareParts(
  doc: Maker,
  view: FicheView,
  handlers: FicheHandlers,
): ElementLike[] {
  const { info } = view;
  if (info === undefined) {
    const failed = view.outcome?.kind === "failed";
    return [
      failed
        ? textLine(doc, INFO_FAILED_LINE, ERROR_CLASS)
        : textLine(doc, LOADING_LINE),
    ];
  }
  if (info.state === "choose") {
    return linkParts(doc, view, info.candidates ?? [], handlers);
  }
  return [textLine(doc, NOT_FOUND_LINE)];
}
