// The owner's end-of-viewing settings, saved from the status page. Queued like set-mode: a sync saves the
// settings it loaded, so a save outside the queue could be overwritten by it. The values were checked by the
// message parser (the grid of THRESHOLD_CHOICES, 0 to 99) and are parsed again whenever the settings load.

import type { Thresholds } from "../core/watch-trigger";
import type { Store } from "../ext/store";

export async function settingsJob(
  store: Pick<Store, "loadSettings" | "saveSettings">,
  thresholds: Thresholds,
  pauseFromPercent: number,
): Promise<void> {
  const settings = await store.loadSettings();
  const same =
    settings.thresholds?.film === thresholds.film &&
    settings.thresholds?.episode === thresholds.episode &&
    settings.pauseFromPercent === pauseFromPercent;
  if (same) return;
  await store.saveSettings({ ...settings, thresholds, pauseFromPercent });
}
