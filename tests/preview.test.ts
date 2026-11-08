import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import type { Write } from "../src/core/sync-writes";
import type { Titled } from "../src/core/title-match";
import { nextOf, previewOf } from "../src/sw/preview";
import type { Describe, PlannedWrite } from "../src/sw/sync-ports";

const DUNE: Titled = { title: "Dune", year: 2021, type: "film" };
const describeOf = (over: Partial<Describe> = {}): Describe => ({
  naka: async () => DUNE,
  sc: async () => DUNE,
  ...over,
});
const pair: Pair = { nakaId: 5, scId: 1005 };

describe("previewOf", () => {
  it("gives an empty title and no year or type to a write whose pair was not added", async () => {
    const planned: PlannedWrite[] = [{ side: "naka", id: 99 }];
    expect(await previewOf(planned, [pair], describeOf())).toEqual([
      { side: "naka", title: "" },
    ]);
  });

  it("matches an addition to SensCritique by its SensCritique id and reads the Naka title", async () => {
    const planned: PlannedWrite[] = [{ side: "sc", id: 1005 }];
    const asked: number[] = [];
    const describe = describeOf({
      naka: async (id) => {
        asked.push(id);
        return DUNE;
      },
    });
    expect(await previewOf(planned, [pair], describe)).toEqual([
      { side: "sc", title: "Dune", year: 2021, type: "film" },
    ]);
    expect(asked).toEqual([5]);
  });

  it("uses the label of a simulated SensCritique write without a year or type", async () => {
    const planned = [
      { side: "sc", id: 5, label: { title: "Heat" } },
    ] as PlannedWrite[];
    expect(await previewOf(planned, [pair], describeOf())).toEqual([
      { side: "sc", title: "Heat" },
    ]);
  });

  it("keeps an empty title when the describe call throws", async () => {
    const planned: PlannedWrite[] = [{ side: "naka", id: 1005 }];
    const describe = describeOf({
      sc: async () => {
        throw new Error("down");
      },
    });
    expect(await previewOf(planned, [pair], describe)).toEqual([
      { side: "naka", title: "" },
    ]);
  });
});

describe("nextOf", () => {
  it("previews at most ten deferred writes, in order", async () => {
    const deferred: Write[] = Array.from({ length: 12 }, (_, i) => ({
      side: "naka" as const,
      pair: { nakaId: i, scId: 1000 + i },
    }));
    const seen: number[] = [];
    const describe = describeOf({
      sc: async (id) => {
        seen.push(id);
        return { title: `T${id}`, type: "film" };
      },
    });
    const items = await nextOf(deferred, describe);
    expect(items).toHaveLength(10);
    expect(seen).toEqual([
      1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009,
    ]);
    expect(items[0]).toEqual({ side: "naka", title: "T1000", type: "film" });
  });
});
