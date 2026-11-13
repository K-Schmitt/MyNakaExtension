import type { RatingCard } from "../core/rating-cards";
import { emptyState, type SyncState } from "../core/state";
import { type FicheLinks, parseFicheLinks } from "./fiche-links-schema";
import { parseRatings } from "./rating-schema";
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
  loadRatings(): Promise<RatingCard[]>;
  saveRatings(cards: RatingCard[]): Promise<void>;
  loadFicheLinks(): Promise<FicheLinks>;
  saveFicheLinks(links: FicheLinks): Promise<void>;
};

const RATINGS_KEY = "ratings";
const STATE_KEY = "state";
const SETTINGS_KEY = "settings";
const FICHE_LINKS_KEY = "ficheLinks";

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
    async loadRatings() {
      return parseRatings(await read(area, RATINGS_KEY));
    },
    async saveRatings(cards) {
      await area.set({ [RATINGS_KEY]: cards });
    },
    async loadFicheLinks() {
      return parseFicheLinks(await read(area, FICHE_LINKS_KEY));
    },
    async saveFicheLinks(links) {
      await area.set({ [FICHE_LINKS_KEY]: links });
    },
  };
}
