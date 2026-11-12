// A finish whose content Naka does not know, or knows as another kind (finish-ports.ts). A page's message
// records nothing: a page script can forge one. A waiting finish played again (retry-job.ts) came from the
// worker's own state: it records the failure, under its question's title, so that it does not vanish.

import type { FinishRecord } from "../ext/settings";

/** A waiting finish played again: the title its question had, on the Naka side. */
export type Replay = { title?: string };

/** What the finish records for a content Naka does not know; undefined for a page's message. */
export function unknownContent(
  replay: Replay | undefined,
): Omit<FinishRecord, "at" | "key"> | undefined {
  if (replay === undefined) return undefined;
  const { title } = replay;
  return {
    outcome: "failed",
    error: "naka-content-unknown",
    ...(title === undefined ? {} : { title }),
  };
}
