// A SensCritique candidate as a button, shared by the home row's questions and the title page: its small
// poster and its label. A trusted click chooses it only while `watch` says it visible: choosing links, which
// can run a finish waiting on the title.

import type { ElementLike } from "./dom-like";
import type { RowWatch } from "./draw-watch";
import type { QuestionHandlers } from "./question-render";
import type { QuestionView } from "./question-view";
import type { Maker } from "./rating-render";
import { onSeenTrustedClick } from "./seen-click";
import { artFrame } from "./tile-art";

type Choice = QuestionView["choices"][number];

const CANDIDATE_CLASS = "mn-btn mn-choice";
const THUMB_CLASS = "mn-thumb";
const LABEL_CLASS = "mn-choice-label";

export function candidateButton(
  doc: Maker,
  { choice, label, image }: Choice,
  handlers: Pick<QuestionHandlers, "onChoose">,
  watch: RowWatch,
): ElementLike {
  const el = doc.createElement("button");
  el.className = CANDIDATE_CLASS;
  el.setAttribute("type", "button");
  el.appendChild(artFrame(doc, image, THUMB_CLASS));
  const text = doc.createElement("span");
  text.className = LABEL_CLASS;
  text.textContent = label;
  el.appendChild(text);
  onSeenTrustedClick(el, watch(el), () => handlers.onChoose(choice));
  return el;
}
