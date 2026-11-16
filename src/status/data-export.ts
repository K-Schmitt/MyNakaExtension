// The file the « Exporter mes données » button gives: what the extension stores, as indented JSON.
// Pure: the manifest version and the clock come in as parameters. The keys are the store's own list.

import { STORED_KEYS } from "../ext/store";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

// The date is the local one: the owner reads it as « today ».
export function exportFileName(now: Date): string {
  const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  return `mynakaextension-donnees-${day}.json`;
}

// A key absent from storage is absent from the file; a value is exported as stored, readable or not.
export function exportText(
  stored: Record<string, unknown>,
  version: string,
  now: Date,
): string {
  const data: Record<string, unknown> = {};
  for (const key of STORED_KEYS) {
    if (Object.hasOwn(stored, key)) data[key] = stored[key];
  }
  return JSON.stringify(
    {
      exportedAt: now.toISOString(),
      extension: "MyNakaExtension",
      version,
      data,
    },
    null,
    2,
  );
}
