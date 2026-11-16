// « Chercher » under « Pas trouvé sur SensCritique » (spec 8b §2): a field holding Naka's title (or the
// words searched last) and the button, then the search's line or its results, shown as step 7's
// candidates. The field's words reach the controller only on a trusted click or a trusted Enter.

import { MAX_SEARCH_QUERY } from "../../ext/fiche-messages";
import type { FicheView } from "../fiche-view";
import type { ElementLike } from "./dom-like";
import type { RowWatch } from "./draw-watch";
import { candidateChoices } from "./fiche-candidate-choice";
import {
  INFO_FAILED_LINE,
  LINKING_LINE,
  nothingFoundLine,
  SEARCH_LABEL,
  SEARCH_PLACEHOLDER,
  SEARCHING_LINE,
} from "./fiche-copy";
import type { FicheHandlers } from "./fiche-handlers";
import type { FieldLike, FieldSlot } from "./field-focus";
import {
  BUTTON_CLASS,
  button,
  ERROR_CLASS,
  type Maker,
  row,
  textLine,
} from "./rating-render";
import { onTrustedEnter } from "./trusted";

const FORM_CLASS = "mn-row mn-search";
const FIELD_CLASS = "mn-field";

// Naka's title may be longer than a query: clipped, never between the two halves of a surrogate pair.
function prefill(text: string): string {
  const clipped = text.slice(0, MAX_SEARCH_QUERY);
  const last = clipped.charCodeAt(clipped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
}

// Read-only while a search is on its way: words typed then would be replaced by the searched ones.
function searchField(doc: Maker, view: FicheView): FieldLike {
  const field = doc.createElement("input") as FieldLike;
  field.className = FIELD_CLASS;
  field.setAttribute("type", "text");
  field.setAttribute("placeholder", SEARCH_PLACEHOLDER);
  field.setAttribute("aria-label", SEARCH_PLACEHOLDER);
  field.setAttribute("maxlength", String(MAX_SEARCH_QUERY));
  field.setAttribute("autocomplete", "off");
  field.setAttribute("enterkeyhint", "search");
  field.value = prefill(view.fieldText ?? "");
  if (view.search?.state === "searching") field.setAttribute("readonly", "");
  return field;
}

/** The controller refuses a search while one, or a link, is on its way: the button says so. */
function busy(view: FicheView): boolean {
  return view.search?.state === "searching" || view.pending !== undefined;
}

function searchForm(
  doc: Maker,
  view: FicheView,
  handlers: Pick<FicheHandlers, "search">,
  slot: FieldSlot,
): ElementLike {
  const field = searchField(doc, view);
  slot.field = field;
  const search = () => handlers.search(field.value);
  onTrustedEnter(field, search);
  const go = button(doc, SEARCH_LABEL, BUTTON_CLASS, search);
  if (busy(view)) {
    go.setAttribute("disabled", "");
    go.setAttribute("aria-disabled", "true");
  }
  return row(doc, [field, go], FORM_CLASS);
}

function searchEnding(
  doc: Maker,
  view: FicheView,
  handlers: Pick<FicheHandlers, "link">,
  watch: RowWatch,
): ElementLike[] {
  const { search } = view;
  if (search === undefined) return [];
  if (view.pending === "link") return [textLine(doc, LINKING_LINE)];
  switch (search.state) {
    case "searching":
      return [textLine(doc, SEARCHING_LINE)];
    case "failed":
      return [textLine(doc, INFO_FAILED_LINE, ERROR_CLASS)];
    case "done":
      return search.candidates.length === 0
        ? [textLine(doc, nothingFoundLine(search.query))]
        : [candidateChoices(doc, search.candidates, handlers, watch)];
  }
}

export function searchParts(
  doc: Maker,
  view: FicheView,
  handlers: Pick<FicheHandlers, "search" | "link">,
  slot: FieldSlot,
  watch: RowWatch,
): ElementLike[] {
  return [
    searchForm(doc, view, handlers, slot),
    ...searchEnding(doc, view, handlers, watch),
  ];
}
