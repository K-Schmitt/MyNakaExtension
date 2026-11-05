// A stored budget window ({ from, count }): the start of the hour and what was spent in it, at most `max`.

import { asInt, asRecord, fail, onlyKeys } from "./field-checks";
import type { FinishWindow } from "./finish-window";

export function parseWindow(
  raw: unknown,
  path: string,
  max: number,
): FinishWindow {
  const record = asRecord(raw, path);
  onlyKeys(record, ["from", "count"], path);
  const from = asInt(record.from, 0, `${path}.from`);
  const count = asInt(record.count, 0, `${path}.count`);
  if (count > max) return fail(`${path}.count`);
  return { from, count };
}
