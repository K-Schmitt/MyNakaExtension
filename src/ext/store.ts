import type { FicheUndo } from "../core/fiche-undo";
import type { RatingCard } from "../core/rating-cards";
import { emptyState, type SyncState } from "../core/state";
import { type FicheLinks, parseFicheLinks } from "./fiche-links-schema";
import { parseFicheUndo } from "./fiche-undo-schema";
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
  /** The one undo record; a corrupt value reads as null. */
  loadFicheUndo(): Promise<FicheUndo | null>;
  /** Replaces the undo record; null clears it. */
  saveFicheUndo(record: FicheUndo | null): Promise<void>;
};

// One storage key per stored value; the data export reads the same list, so a new key reaches it.
const KEYS = {
  state: "state",
  settings: "settings",
  ratings: "ratings",
  ficheLinks: "ficheLinks",
  ficheUndo: "ficheUndo",
} as const;

export type StoredKey = (typeof KEYS)[keyof typeof KEYS];

export const STORED_KEYS: readonly StoredKey[] = Object.values(KEYS);

// Only an absent key means a first install; a stored value that does not parse rejects.
async function read(area: StorageArea, key: string): Promise<unknown> {
  const found = await area.get(key);
  return Object.hasOwn(found, key) ? found[key] : undefined;
}

export function createStore(area: StorageArea): Store {
  return {
    async loadState() {
      const raw = await read(area, KEYS.state);
      return raw === undefined ? emptyState() : parseState(raw);
    },
    async saveState(s) {
      await area.set({ [KEYS.state]: s });
    },
    async loadSettings() {
      return parseSettings(await read(area, KEYS.settings));
    },
    async saveSettings(s) {
      await area.set({ [KEYS.settings]: s });
    },
    async loadRatings() {
      return parseRatings(await read(area, KEYS.ratings));
    },
    async saveRatings(cards) {
      await area.set({ [KEYS.ratings]: cards });
    },
    async loadFicheLinks() {
      return parseFicheLinks(await read(area, KEYS.ficheLinks));
    },
    async saveFicheLinks(links) {
      await area.set({ [KEYS.ficheLinks]: links });
    },
    async loadFicheUndo() {
      return parseFicheUndo(await read(area, KEYS.ficheUndo));
    },
    async saveFicheUndo(record) {
      await area.set({ [KEYS.ficheUndo]: record });
    },
  };
}
