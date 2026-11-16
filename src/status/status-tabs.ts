// The two tabs of the status page: which one shows, and where an arrow key leads. No DOM here.

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
