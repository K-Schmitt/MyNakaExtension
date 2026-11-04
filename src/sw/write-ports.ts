// The list-sync writes. Live: the Plan 2 contract (a product already done on SensCritique is never
// wished). Simulation (spec §8quinquies): nothing is written; each write the run would make is recorded
// for the preview, and the product state is still READ so that the report says what live would do.

import type { WritePorts } from "../core/sync-writes";
import type { Mode } from "../ext/settings";
import type { NakaClient } from "../naka/naka-client";
import type { ScClient } from "../sc/sc-client";

export type PlannedWrite = { side: "naka" | "sc"; id: number };

function liveWrites(naka: NakaClient, sc: ScClient): WritePorts {
  return {
    addToNaka: (id) => naka.addToPlaylist(id),
    addToSc: async (id) => {
      const { isDone } = await sc.productState(id);
      if (isDone) return "already-done";
      await sc.wish(id);
      return "added";
    },
  };
}

function simulatedWrites(sc: ScClient, planned: PlannedWrite[]): WritePorts {
  return {
    addToNaka: async (id) => {
      planned.push({ side: "naka", id });
    },
    addToSc: async (id) => {
      const { isDone } = await sc.productState(id);
      if (isDone) return "already-done";
      planned.push({ side: "sc", id });
      return "added";
    },
  };
}

// Only "live" writes: any other mode, a stored typo included, simulates.
export function writePorts(
  mode: Mode,
  naka: NakaClient,
  sc: ScClient,
  planned: PlannedWrite[],
): WritePorts {
  return mode === "live" ? liveWrites(naka, sc) : simulatedWrites(sc, planned);
}
