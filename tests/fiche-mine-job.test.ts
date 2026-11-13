import { describe, expect, it } from "vitest";
import { createFicheRegistry } from "../src/sw/fiche-registry";
import { createJobs } from "../src/sw/jobs";
import { answerWorld } from "./answer-world";
import {
  info,
  linkedTo,
  mine,
  nakaSays,
  OTHER_TAB,
  TAB,
} from "./fiche-fixtures";

const linkedWorld = () =>
  answerWorld({
    state: linkedTo(2005),
    naka: nakaSays(),
    product: () => ({ rating: 8, average: 7.1, label: { title: "Solaris" } }),
  });

describe("fiche-mine", () => {
  it("an issued product: the owner's rating and the average, one read through the SC limiter", async () => {
    const w = linkedWorld();
    await w.jobs.ficheInfo(TAB, info());
    w.sk.calls.length = 0;
    w.limited.length = 0;
    expect(await w.jobs.ficheMine(TAB, mine())).toEqual({
      mine: 8,
      average: 7.1,
    });
    expect(w.sk.calls).toEqual(["productState:2005"]);
    expect(w.limited).toEqual(["limit:sc"]);
  });

  it("a product with no average yet: a null average", async () => {
    const w = answerWorld({
      state: linkedTo(2005),
      naka: nakaSays(),
      product: () => ({ rating: null, average: null, label: { title: "S" } }),
    });
    await w.jobs.ficheInfo(TAB, info());
    expect(await w.jobs.ficheMine(TAB, mine())).toEqual({
      mine: null,
      average: null,
    });
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

  it("a restarted worker still knows the products issued before", async () => {
    const w = linkedWorld();
    await w.jobs.ficheInfo(TAB, info());
    const restarted = createJobs(w.jobDeps, createFicheRegistry(w.session));
    expect(await restarted.ficheMine(TAB, mine())).toEqual({
      mine: 8,
      average: 7.1,
    });
  });

  it("a closed tab forgets its products", async () => {
    const w = linkedWorld();
    await w.jobs.ficheInfo(TAB, info());
    await w.jobs.dropFicheTab(TAB);
    w.sk.calls.length = 0;
    await expect(w.jobs.ficheMine(TAB, mine())).rejects.toThrow();
    expect(w.sk.calls).toEqual([]);
  });
});
