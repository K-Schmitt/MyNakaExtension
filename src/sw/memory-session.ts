// A storage area in memory, for a worker composed without chrome.storage.session (the test suites that
// build their jobs without one). The entry file always binds the real session area.

import type { StorageArea } from "../ext/store";

export function memorySession(): StorageArea {
  const data = new Map<string, unknown>();
  return {
    get: async (key) =>
      data.has(key) ? { [key]: structuredClone(data.get(key)) } : {},
    set: async (items) => {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, structuredClone(value));
      }
    },
  };
}
