// The SensCritique block of the title page's info panel, drawn from the controller's view: the average,
// the title a star rates, « Ta note » and ten stars; a series asks its confirmation first. Before that:
// loading, « Relier à SensCritique » with the candidates, or « Pas trouvé ». Texts go through textContent;
// every button acts on a trusted click only.

import { thumbUrl } from "../../core/image-urls";
import type { QuestionCandidate } from "../../core/state";
import type { FicheProduct } from "../../ext/fiche-answers";
import type { FicheView } from "../fiche-view";
import type { ElementLike } from "./dom-like";
import {
  averageLine,
  INFO_FAILED_LINE,
  LINK_FAILED_LINE,
  LINK_HEADING,
  LINKING_LINE,
  LOADING_LINE,
  labelLine,
  MINE_LABEL,
  NO_AVERAGE_LINE,
  NOT_FOUND_LINE,
  outcomeLine,
  PANEL_TITLE,
  SERIES_CONFIRM,
  seasonFailedLine,
} from "./fiche-copy";
import { type FicheHandlers, ficheStars } from "./fiche-handlers";
import { candidateLabel } from "./question-copy";
import { candidateButton } from "./question-tile";
import { NOT_RATED_LINE, SENDING_LINE } from "./rating-copy";
import {
  confirmRow,
  ERROR_CLASS,
  type Maker,
  row,
  TITLE_CLASS,
  textLine,
  WARNING_CLASS,
} from "./rating-render";

const PANEL_CLASS = "mn-fiche";
const HEAD_CLASS = "mn-fiche-head";
const NAME_CLASS = "mn-fiche-name";
const AVERAGE_CLASS = "mn-fiche-average";
const MINE_CLASS = "mn-fiche-mine";
const CHOICES_CLASS = "mn-choices";

function head(doc: Maker, product: FicheProduct | undefined): ElementLike {
  const parts = [textLine(doc, PANEL_TITLE, NAME_CLASS)];
  if (product?.average != null) {
    parts.push(textLine(doc, averageLine(product.average), AVERAGE_CLASS));
  }
  return row(doc, parts, HEAD_CLASS);
}

function outcomeLines(doc: Maker, view: FicheView, failed: string) {
  const { outcome } = view;
  if (outcome === undefined) return [];
  return [textLine(doc, outcomeLine(outcome, failed), ERROR_CLASS)];
}

function seasonLines(doc: Maker, view: FicheView): ElementLike[] {
  if (view.seasonFailed !== true || view.season === undefined) return [];
  return [textLine(doc, seasonFailedLine(view.season), ERROR_CLASS)];
}

function seriesConfirm(doc: Maker, handlers: FicheHandlers): ElementLike[] {
  return [
    textLine(doc, SERIES_CONFIRM, WARNING_CLASS),
    confirmRow(doc, {
      onConfirm: (send) =>
        send ? handlers.confirmSeries() : handlers.cancelSeries(),
    }),
  ];
}

function rating(
  doc: Maker,
  view: FicheView,
  product: FicheProduct,
  handlers: FicheHandlers,
): ElementLike[] {
  if (view.pending === "confirm-series") return seriesConfirm(doc, handlers);
  const stars = ficheStars(doc, product.mine, handlers.rateTitle);
  if (view.pending !== "rating") return [stars];
  return [stars, textLine(doc, SENDING_LINE)];
}

function productParts(
  doc: Maker,
  view: FicheView,
  product: FicheProduct,
  handlers: FicheHandlers,
): ElementLike[] {
  return [
    ...(product.average === null ? [textLine(doc, NO_AVERAGE_LINE)] : []),
    textLine(doc, labelLine(product.label)),
    textLine(doc, MINE_LABEL, MINE_CLASS),
    ...rating(doc, view, product, handlers),
    ...outcomeLines(doc, view, NOT_RATED_LINE),
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

function bodyParts(
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
  if (info.product !== undefined) {
    return productParts(doc, view, info.product, handlers);
  }
  if (info.state === "choose") {
    return linkParts(doc, view, info.candidates ?? [], handlers);
  }
  return [textLine(doc, NOT_FOUND_LINE)];
}

/**
 * What the block shows, as one string: two views with equal inputs draw the same block. Every field counts
 * but the episodes (the boxes draw them), so a field added to the view is compared by default.
 */
export function panelInputs(view: FicheView): string {
  const { episodes: _drawnByTheBoxes, ...shown } = view;
  return JSON.stringify(shown);
}

export function buildFichePanel(
  doc: Maker,
  view: FicheView,
  handlers: FicheHandlers,
): ElementLike {
  const panel = doc.createElement("div");
  panel.className = PANEL_CLASS;
  const parts = [
    head(doc, view.info?.product),
    ...bodyParts(doc, view, handlers),
    ...seasonLines(doc, view),
  ];
  for (const part of parts) panel.appendChild(part);
  return panel;
}
