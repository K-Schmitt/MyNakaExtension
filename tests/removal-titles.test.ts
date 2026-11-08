import { describe, expect, it } from "vitest";
import { titleNewRemovals } from "../src/core/removal-titles";
import { emptyState } from "../src/core/state";
import type { Titled } from "../src/core/title-match";

const pair = { nakaId: 1, scId: 101 };
const image = { posterPath: "/a.jpg" };

function ports(naka?: Titled, sc?: Titled) {
  return {
    describeNaka: async () => naka,
    describeSc: async () => sc,
  };
}

describe("titleNewRemovals images", () => {
  it("takes title and image from the side the removal is made from", async () => {
    const naka: Titled = { title: "N", type: "film", image };
    const sc: Titled = { title: "S", type: "film" };
    const [fromNaka] = await titleNewRemovals(
      emptyState(),
      [{ removeFrom: "naka", pair }],
      ports(naka, sc),
    );
    const [fromSc] = await titleNewRemovals(
      emptyState(),
      [{ removeFrom: "sc", pair }],
      ports(naka, sc),
    );
    expect(fromNaka).toEqual({ removeFrom: "naka", pair, title: "N", image });
    expect(fromSc).toEqual({ removeFrom: "sc", pair, title: "S" });
  });

  it("leaves the image out when the read gave none", async () => {
    const [out] = await titleNewRemovals(
      emptyState(),
      [{ removeFrom: "naka", pair }],
      ports({ title: "N", type: "film" }),
    );
    expect("image" in (out ?? {})).toBe(false);
  });
});
