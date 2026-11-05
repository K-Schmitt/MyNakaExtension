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

// What survives a reset. The last run, the last finish and the last answer describe the erased state.
function keptOf(settings: Settings): Settings {
  const { binding, thresholds, pauseFromPercent, lastAutoRunAt, finishWindow } =
    settings;
  return {
    mode: "simulation",
    ...(binding === undefined ? {} : { binding }),
    ...(thresholds === undefined ? {} : { thresholds }),
    ...(pauseFromPercent === undefined ? {} : { pauseFromPercent }),
    ...(lastAutoRunAt === undefined ? {} : { lastAutoRunAt }),
    ...(finishWindow === undefined ? {} : { finishWindow }),
  };
}

async function keptSettings(store: SettingsStore): Promise<Settings> {
  try {
    return keptOf(await store.loadSettings());
  } catch {
    return { mode: "simulation" };
  }
}

/**
 * « Réinitialiser »: the sync state and the ratings are replaced, never loaded, so that a store that no
 * longer parses is repaired. The settings that matter stay; unreadable ones become the defaults.
 */
export async function resetJob(
  store: SettingsStore & Pick<Store, "saveState" | "saveRatings">,
): Promise<void> {
  await store.saveState(emptyState());
  await store.saveRatings([]);
  await store.saveSettings(await keptSettings(store));
}
