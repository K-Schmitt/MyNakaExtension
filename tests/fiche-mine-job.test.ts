import { describe, expect, it } from "vitest";
import { answerWorld } from "./answer-world";
import { info, linkedTo, mine, OTHER_TAB, TAB } from "./fiche-fixtures";

const linkedWorld = () =>
  answerWorld({
    state: linkedTo(2005),
    product: () => ({ rating: 8, average: 7.1 }),
  });

describe("fiche-mine", () => {
  it("an issued product: the owner's rating, one read through the SC limiter", async () => {
    const w = linkedWorld();
    await w.jobs.ficheInfo(TAB, info());
    w.sk.calls.length = 0;
    w.limited.length = 0;
    expect(await w.jobs.ficheMine(TAB, mine())).toEqual({ mine: 8 });
    expect(w.sk.calls).toEqual(["productState:2005"]);
    expect(w.limited).toEqual(["limit:sc"]);
  });

  it("a product never issued: rejected without a request", async () => {
    const w = linkedWorld();
    await expect(w.jobs.ficheMine(TAB, mine())).rejects.toThrow();
    expect(w.sk.calls).toEqual([]);
    expect(w.limited).toEqual([]);
  });

  it("a product issued to another tab: rejected without a request", async () => {
    const w = linkedWorld();
    await w.jobs.ficheInfo(OTHER_TAB, info());
    w.sk.calls.length = 0;
    await expect(w.jobs.ficheMine(TAB, mine())).rejects.toThrow();
    expect(w.sk.calls).toEqual([]);
  });

  it("a product issued for another content: rejected", async () => {
    const w = linkedWorld();
    await w.jobs.ficheInfo(TAB, info());
    await expect(
      w.jobs.ficheMine(TAB, mine({ contentId: 6 })),
    ).rejects.toThrow();
  });

  it("a closed tab forgets its products", async () => {
    const w = linkedWorld();
    await w.jobs.ficheInfo(TAB, info());
    w.jobs.dropFicheTab(TAB);
    w.sk.calls.length = 0;
    await expect(w.jobs.ficheMine(TAB, mine())).rejects.toThrow();
    expect(w.sk.calls).toEqual([]);
  });
});
