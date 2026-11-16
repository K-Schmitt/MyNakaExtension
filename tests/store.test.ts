import { describe, expect, it } from "vitest";
import type { SyncState } from "../src/core/state";
import { emptyState } from "../src/core/state";
import type { Settings } from "../src/ext/settings";
import { createStore, STORED_KEYS, type StorageArea } from "../src/ext/store";
import { StoredStateError } from "../src/ext/stored-error";
import { episodeCard, filmCard } from "./rating-fixtures";

function fakeArea(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const area: StorageArea = {
    async get(key) {
      return data.has(key) ? { [key]: data.get(key) } : {};
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    },
  };
  return { area, data };
}

function sample(): SyncState {
  return {
    ...emptyState(),
    mapping: [{ nakaId: 1, scId: 2 }],
    run: 3,
    presence: { naka: [{ id: 1, from: 1, to: 3 }], sc: [] },
  };
}

describe("state store", () => {
  it("round-trips a state", async () => {
    const { area } = fakeArea();
    const store = createStore(area);
    await store.saveState(sample());
    expect(await store.loadState()).toEqual(sample());
  });

  it("stores the state under the key state", async () => {
    const { area, data } = fakeArea();
    await createStore(area).saveState(sample());
    expect(data.get("state")).toEqual(sample());
  });

  it("gives the empty state when the key is absent", async () => {
    const store = createStore(fakeArea().area);
    expect(await store.loadState()).toEqual(emptyState());
  });

  it("does not give the empty state for a stored null", async () => {
    const store = createStore(fakeArea({ state: null }).area);
    await expect(store.loadState()).rejects.toBeInstanceOf(StoredStateError);
  });

  it("rejects an invalid stored state", async () => {
    const store = createStore(
      fakeArea({ state: { ...sample(), run: -1 } }).area,
    );
    await expect(store.loadState()).rejects.toThrow("stored state: run");
  });

  it("rejects when the read rejects", async () => {
    const area: StorageArea = {
      get: () => Promise.reject(new Error("read failed")),
      set: () => Promise.resolve(),
    };
    await expect(createStore(area).loadState()).rejects.toThrow("read failed");
  });

  it("rejects when the write rejects", async () => {
    const area: StorageArea = {
      get: () => Promise.resolve({}),
      set: () => Promise.reject(new Error("quota")),
    };
    await expect(createStore(area).saveState(sample())).rejects.toThrow(
      "quota",
    );
  });
});

describe("settings store", () => {
  const settings: Settings = {
    mode: "live",
    binding: { scUsername: "someone" },
    lastAutoRunAt: 5,
  };

  it("round-trips settings", async () => {
    const store = createStore(fakeArea().area);
    await store.saveSettings(settings);
    expect(await store.loadSettings()).toEqual(settings);
  });

  it("stores the settings under the key settings", async () => {
    const { area, data } = fakeArea();
    await createStore(area).saveSettings(settings);
    expect(data.get("settings")).toEqual(settings);
  });

  it("gives live with the first run pending when the key is absent", async () => {
    const store = createStore(fakeArea().area);
    expect(await store.loadSettings()).toEqual({
      mode: "live",
      firstRunPending: true,
    });
  });

  it("rejects invalid stored settings", async () => {
    const store = createStore(fakeArea({ settings: { mode: "x" } }).area);
    await expect(store.loadSettings()).rejects.toThrow(
      "stored state: settings.mode",
    );
  });

  it("rejects when the read rejects", async () => {
    const area: StorageArea = {
      get: () => Promise.reject(new Error("read failed")),
      set: () => Promise.resolve(),
    };
    await expect(createStore(area).loadSettings()).rejects.toThrow(
      "read failed",
    );
  });

  it("keeps state and settings apart", async () => {
    const { area } = fakeArea();
    const store = createStore(area);
    await store.saveState(sample());
    await store.saveSettings(settings);
    expect(await store.loadState()).toEqual(sample());
    expect(await store.loadSettings()).toEqual(settings);
  });
});

describe("ratings store", () => {
  const cards = [filmCard(), episodeCard({ given: { épisode: 7 } })];

  it("round-trips the cards", async () => {
    const store = createStore(fakeArea().area);
    await store.saveRatings(cards);
    expect(await store.loadRatings()).toEqual(cards);
  });

  it("stores the cards under the key ratings", async () => {
    const { area, data } = fakeArea();
    await createStore(area).saveRatings(cards);
    expect(data.get("ratings")).toEqual(cards);
  });

  it("gives an empty list when the key is absent", async () => {
    const store = createStore(fakeArea().area);
    expect(await store.loadRatings()).toEqual([]);
  });

  it("does not give an empty list for a stored null", async () => {
    const store = createStore(fakeArea({ ratings: null }).area);
    await expect(store.loadRatings()).rejects.toBeInstanceOf(StoredStateError);
  });

  it("rejects an invalid stored card and leaves the store untouched", async () => {
    const stored = [{ ...filmCard(), title: "" }];
    const { area, data } = fakeArea({ ratings: stored });
    await expect(createStore(area).loadRatings()).rejects.toThrow(
      "stored state: ratings[0].title",
    );
    expect(data.get("ratings")).toBe(stored);
  });

  it("rejects when the write rejects", async () => {
    const area: StorageArea = {
      get: () => Promise.resolve({}),
      set: () => Promise.reject(new Error("quota")),
    };
    await expect(createStore(area).saveRatings(cards)).rejects.toThrow("quota");
  });

  it("keeps ratings apart from state and settings", async () => {
    const { area } = fakeArea();
    const store = createStore(area);
    await store.saveState(sample());
    await store.saveRatings(cards);
    expect(await store.loadState()).toEqual(sample());
    expect(await store.loadRatings()).toEqual(cards);
  });
});

describe("fiche links store", () => {
  it("loads no links when the key is absent", async () => {
    expect(await createStore(fakeArea().area).loadFicheLinks()).toEqual({});
  });

  it("round-trips links under the key ficheLinks", async () => {
    const { area, data } = fakeArea();
    const store = createStore(area);
    await store.saveFicheLinks({ "7": 99 });
    expect(data.get("ficheLinks")).toEqual({ "7": 99 });
    expect(await store.loadFicheLinks()).toEqual({ "7": 99 });
  });

  it("rejects a stored value that does not parse", async () => {
    const store = createStore(fakeArea({ ficheLinks: { x: 1 } }).area);
    await expect(store.loadFicheLinks()).rejects.toThrow(StoredStateError);
  });

  it("keeps the links apart from state", async () => {
    const { area } = fakeArea();
    const store = createStore(area);
    await store.saveState(sample());
    await store.saveFicheLinks({ "7": 99 });
    expect(await store.loadState()).toEqual(sample());
  });
});

describe("fiche undo store", () => {
  const undo = {
    contentId: 7,
    productId: 99,
    role: "film" as const,
    at: 1_700_000_000_000,
    before: {
      rating: null,
      isDone: false,
      dateDone: null,
      isWished: true,
      inMaListe: true,
    },
    local: { handled: false, settled: false, cards: [] },
  };

  it("loads no record when the key is absent", async () => {
    expect(await createStore(fakeArea().area).loadFicheUndo()).toBeNull();
  });

  it("round-trips the record under the key ficheUndo", async () => {
    const { area, data } = fakeArea();
    const store = createStore(area);
    await store.saveFicheUndo(undo);
    expect(data.get("ficheUndo")).toEqual(undo);
    expect(await store.loadFicheUndo()).toEqual(undo);
  });

  it("clears the record by saving null", async () => {
    const { area } = fakeArea();
    const store = createStore(area);
    await store.saveFicheUndo(undo);
    await store.saveFicheUndo(null);
    expect(await store.loadFicheUndo()).toBeNull();
  });

  it("reads a corrupt record as null instead of rejecting", async () => {
    const store = createStore(fakeArea({ ficheUndo: { x: 1 } }).area);
    expect(await store.loadFicheUndo()).toBeNull();
  });
});

// Every save, found by name: a new stored key with its save method must be listed in STORED_KEYS.
describe("STORED_KEYS", () => {
  it("lists exactly the keys the store's saves write", async () => {
    const { area, data } = fakeArea();
    const store = createStore(area);
    const saves = Object.entries(store).filter(([name]) =>
      name.startsWith("save"),
    );
    for (const [, save] of saves) {
      await (save as (value: unknown) => Promise<void>)(null);
    }
    expect(saves).toHaveLength(STORED_KEYS.length);
    expect([...data.keys()].sort()).toEqual([...STORED_KEYS].sort());
  });
});
