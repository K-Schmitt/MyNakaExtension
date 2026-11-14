// The status page's two local actions. Both touch storage only, never a site. They run on the queue like
// every job, so that a sync never saves over them.

import { emptyState } from "../core/state";
import type { Settings } from "../ext/settings";
import type { Store } from "../ext/store";

type SettingsStore = Pick<Store, "loadSettings" | "saveSettings">;

function withoutBinding(settings: Settings): Settings {
  const { binding: _forgotten, ...rest } = settings;
  return rest;
}

/** « Oublier les comptes liés »: drops the binding, nothing else. Without one, no save. */
export async function forgetJob(store: SettingsStore): Promise<void> {
  const settings = await store.loadSettings();
  if (!settings.binding) return;
  await store.saveSettings(withoutBinding(settings));
}

/** One decision per setting: a field added to Settings does not compile until it is kept or dropped. */
export type ResetRules = Record<keyof Settings, "keep" | "drop">;
export const RESET_RULES: ResetRules = {
  mode: "drop", // always simulation
  binding: "keep",
  thresholds: "keep",
  pauseFromPercent: "keep",
  lastAutoRunAt: "keep",
  finishWindow: "keep",
  forgetWindow: "keep",
  // The seq counter never restarts: open blocks and the page hold older baselines.
  lastAnswer: "keep",
  // These describe the erased state.
  lastRun: "drop",
  lastFinish: "drop",
};

function keptOf(settings: Settings): Settings {
  const kept = Object.entries(settings).filter(
    ([key]) => RESET_RULES[key as keyof Settings] === "keep",
  );
  return { ...Object.fromEntries(kept), mode: "simulation" };
}

async function keptSettings(store: SettingsStore): Promise<Settings> {
  try {
    return keptOf(await store.loadSettings());
  } catch {
    return { mode: "simulation" };
  }
}

/**
 * « Réinitialiser »: the sync state, the ratings, the title page links and the undo record are replaced,
 * never loaded, so that a store that no longer parses is repaired (an « Annuler » after a reset would put
 * back a local state from before it). The settings that matter stay; unreadable ones become
 * the defaults. They are saved FIRST: a failed save after an emptied state would leave the live mode over
 * an empty state.
 */
export async function resetJob(
  store: SettingsStore &
    Pick<
      Store,
      "saveState" | "saveRatings" | "saveFicheLinks" | "saveFicheUndo"
    >,
): Promise<void> {
  await store.saveSettings(await keptSettings(store));
  await store.saveState(emptyState());
  await store.saveRatings([]);
  await store.saveFicheLinks({});
  await store.saveFicheUndo(null);
}
