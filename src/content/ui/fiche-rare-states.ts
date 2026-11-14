// The step 7 states the actions host shows instead of, or under, its buttons: loading, its failure with
// « Réessayer », the candidates to link with their posters, « Pas trouvé » with its search (step 8b), a
// series' confirmation, the write's and the season's error lines. Texts go through textContent; every
// button acts on a trusted click only.

import type { QuestionCandidate } from "../../core/state";
import type { FicheView } from "../fiche-view";
import type { ElementLike } from "./dom-like";
import { candidateChoices } from "./fiche-candidate-choice";
import {
  INFO_FAILED_LINE,
  LINK_FAILED_LINE,
  LINK_HEADING,
  LINKING_LINE,
  LOADING_LINE,
  NOT_FOUND_LINE,
  outcomeLine,
  RETRY_LABEL,
  SERIES_CONFIRM,
  seasonFailedLine,
} from "./fiche-copy";
import type { FicheHandlers } from "./fiche-handlers";
import { searchParts } from "./fiche-search-parts";
import {
  BUTTON_CLASS,
  button,
  confirmRow,
  ERROR_CLASS,
  type Maker,
  row,
  TITLE_CLASS,
  textLine,
  WARNING_CLASS,
} from "./rating-render";

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

function linkParts(
  doc: Maker,
  view: FicheView,
  candidates: readonly QuestionCandidate[],
  handlers: FicheHandlers,
): ElementLike[] {
  const choices =
    view.pending === "link"
      ? textLine(doc, LINKING_LINE)
      : candidateChoices(doc, candidates, handlers);
  return [
    textLine(doc, LINK_HEADING, TITLE_CLASS),
    choices,
    ...outcomeLines(doc, view, LINK_FAILED_LINE),
  ];
}

/** The loading line, or once the read failed its line and « Réessayer »; then the last write's line. */
function infoParts(
  doc: Maker,
  view: FicheView,
  handlers: FicheHandlers,
): ElementLike[] {
  const written = outcomeLines(doc, view, INFO_FAILED_LINE);
  if (view.infoFailed !== true)
    return [textLine(doc, LOADING_LINE), ...written];
  return [
    textLine(doc, INFO_FAILED_LINE, ERROR_CLASS),
    row(doc, [button(doc, RETRY_LABEL, BUTTON_CLASS, handlers.retry)]),
    ...written,
  ];
}

function notFoundParts(
  doc: Maker,
  view: FicheView,
  handlers: FicheHandlers,
): ElementLike[] {
  return [
    textLine(doc, NOT_FOUND_LINE),
    ...searchParts(doc, view, handlers),
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
  if (info === undefined) return infoParts(doc, view, handlers);
  if (info.state === "choose") {
    return linkParts(doc, view, info.candidates ?? [], handlers);
  }
  return notFoundParts(doc, view, handlers);
}
