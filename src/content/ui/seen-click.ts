// A write control acts on a trusted click only while its row counts as seen (star-visibility: shown long
// enough, uncovered, not faded). `counts` is the answer of the row's watch; a row of several controls
// shares one.

import { type Clickable, onTrustedClick } from "./trusted";

export function onSeenTrustedClick(
  el: Clickable,
  counts: () => boolean,
  fn: () => void,
): void {
  onTrustedClick(el, () => {
    if (counts()) fn();
  });
}
