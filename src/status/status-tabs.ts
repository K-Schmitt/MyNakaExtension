// The two tabs of the status page: which one shows, and where an arrow key leads. No DOM here.

import type { FocusTarget } from "./status-controller";

export type TabId = "activite" | "reglages";

export const TAB_IDS: readonly TabId[] = ["activite", "reglages"];

export function tabFromHash(hash: string): TabId {
  return hash === "#reglages" ? "reglages" : "activite";
}

export function tabAfterKey(current: TabId, key: string): TabId | undefined {
  const last = TAB_IDS.length - 1;
  const at = TAB_IDS.indexOf(current);
  if (key === "ArrowRight") return TAB_IDS[at === last ? 0 : at + 1];
  if (key === "ArrowLeft") return TAB_IDS[at === 0 ? last : at - 1];
  if (key === "Home") return TAB_IDS[0];
  if (key === "End") return TAB_IDS[last];
  return undefined;
}

const PANEL_OF: Record<FocusTarget, TabId> = {
  resync: "activite",
  switch: "reglages",
  headline: "activite",
  forget: "reglages",
  reset: "reglages",
};

// The id to focus: the target itself, or the selected tab button when the target sits in a hidden panel.
export function focusIdFor(target: FocusTarget, selected: TabId): string {
  return PANEL_OF[target] === selected ? target : `tab-${selected}`;
}
