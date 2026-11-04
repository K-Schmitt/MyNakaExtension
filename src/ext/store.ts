import { emptyState, type SyncState } from "../core/state";
import { parseSettings, type Settings } from "./settings";
import { parseState } from "./state-schema";

export type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export type Store = {
  loadState(): Promise<SyncState>;
  saveState(s: SyncState): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
};

const STATE_KEY = "state";
const SETTINGS_KEY = "settings";

// Only an absent key means a first install; a stored value that does not parse rejects.
async function read(area: StorageArea, key: string): Promise<unknown> {
  const found = await area.get(key);
  return Object.hasOwn(found, key) ? found[key] : undefined;
}

export function createStore(area: StorageArea): Store {
  return {
    async loadState() {
      const raw = await read(area, STATE_KEY);
      return raw === undefined ? emptyState() : parseState(raw);
    },
    async saveState(s) {
      await area.set({ [STATE_KEY]: s });
    },
    async loadSettings() {
      return parseSettings(await read(area, SETTINGS_KEY));
    },
    async saveSettings(s) {
      await area.set({ [SETTINGS_KEY]: s });
    },
  };
}
