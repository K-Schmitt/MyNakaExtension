import { describe, expect, it } from "vitest";
import { handleFinish } from "../src/core/finish-handler";
import { emptyState, type PendingItem } from "../src/core/state";
import type { Titled } from "../src/core/title-match";
import {
  cand,
  episode,
  FILM,
  FILM_PAIR,
  FILM_SC,
  FILM_TITLE,
  failure,
  film,
  SERIES,
  SERIES_PAIR,
  SERIES_SC,
  SERIES_TITLE,
  world,
  writesOf,
} from "./finish-fakes";

describe("matching on SensCritique", () => {
  const BILINGUAL: Titled = {
    title: "Le Titre",
    originalTitle: "The Title",
    year: 2001,
    type: "film",
  };
  const bilingual = film({ titled: BILINGUAL });
  const searches = (calls: string[]) =>
    calls.filter((c) => c.startsWith("searchSc"));

  it("a mapped series is not searched", async () => {
    const w = world({ state: { mapping: [SERIES_PAIR] } });
    await handleFinish(episode(1, 2), w.ports);
    expect(searches(w.calls)).toEqual([]);
    expect(w.calls).toContain("seasonInfo:1007:1");
  });

  it("searches the original title when the title finds no candidate", async () => {
    const w = world({
      search: {
        "Le Titre": [],
        "The Title": [cand(FILM_SC, { ...BILINGUAL, title: "The Title" })],
      },
    });
    expect((await handleFinish(bilingual, w.ports)).kind).toBe("done");
    expect(searches(w.calls)).toEqual([
      "searchSc:Le Titre",
      "searchSc:The Title",
    ]);
  });

  it("does not search the original title when the title found a candidate", async () => {
    const w = world({
      search: {
        "Le Titre": [cand(FILM_SC, BILINGUAL)],
        "The Title": [cand(9999, BILINGUAL)],
      },
    });
    expect((await handleFinish(bilingual, w.ports)).kind).toBe("done");
    expect(searches(w.calls)).toEqual(["searchSc:Le Titre"]);
    expect(w.calls).toContain("productState:1042");
  });

  it("does not search the original title when the title's candidates do not match", async () => {
    const w = world({
      search: {
        "Le Titre": [cand(3000, { title: "Autre", year: 2001, type: "film" })],
        "The Title": [cand(FILM_SC, BILINGUAL)],
      },
    });
    expect(await handleFinish(bilingual, w.ports)).toEqual({
      kind: "not-found",
    });
    expect(searches(w.calls)).toEqual(["searchSc:Le Titre"]);
  });

  it("searches once when there is no original title", async () => {
    const w = world({ search: { "Le Film": [] } });
    expect(await handleFinish(film(), w.ports)).toEqual({ kind: "not-found" });
    expect(w.calls).toEqual(["load", "searchSc:Le Film"]);
    expect(w.saved).toEqual([]);
  });

  it("a candidate listed twice is one candidate", async () => {
    const c = cand(FILM_SC, FILM_TITLE);
    const w = world({ search: { "Le Film": [c, c] } });
    expect((await handleFinish(film(), w.ports)).kind).toBe("done");
  });

  it("an ambiguous film asks the owner, saves the question and writes nothing", async () => {
    const w = world({
      search: {
        "Le Film": [cand(FILM_SC, FILM_TITLE), cand(2042, FILM_TITLE)],
      },
    });
    expect(await handleFinish(film(), w.ports)).toEqual({
      kind: "needs-choice",
      candidateIds: [FILM_SC, 2042],
    });
    expect(w.calls).toEqual(["load", "searchSc:Le Film", "save"]);
    expect(w.saved).toStrictEqual([
      {
        ...emptyState(),
        pending: [
          {
            kind: "ambiguity",
            side: "naka",
            id: FILM,
            candidateIds: [FILM_SC, 2042],
          },
        ],
      },
    ]);
  });

  it("an ambiguous series asks the owner before any season read", async () => {
    const w = world({
      search: {
        "La Série": [cand(SERIES_SC, SERIES_TITLE), cand(2007, SERIES_TITLE)],
      },
    });
    expect(await handleFinish(episode(1, 2), w.ports)).toEqual({
      kind: "needs-choice",
      candidateIds: [SERIES_SC, 2007],
    });
    expect(w.calls).toEqual(["load", "searchSc:La Série", "save"]);
    expect(w.state.pending).toEqual([
      {
        kind: "ambiguity",
        side: "naka",
        id: SERIES,
        candidateIds: [SERIES_SC, 2007],
      },
    ]);
  });

  it("a rejected save of the question rejects", async () => {
    const w = world({
      failSave: [1],
      search: {
        "Le Film": [cand(FILM_SC, FILM_TITLE), cand(2042, FILM_TITLE)],
      },
    });
    expect((await failure(handleFinish(film(), w.ports))).message).toBe(
      "save failed",
    );
  });

  it("no candidate: not-found, nothing saved", async () => {
    const w = world({ search: { "Le Film": [] } });
    expect(await handleFinish(film(), w.ports)).toEqual({ kind: "not-found" });
    expect(w.saved).toEqual([]);
  });

  it.each([
    ["film", film(), FILM, FILM_SC],
    ["series", episode(1, 2), SERIES, SERIES_SC],
  ] as const)(
    "a %s matching an id mapped to another Naka title asks the owner (swap guard)",
    async (_name, event, nakaId, scId) => {
      const other = { nakaId: 99, scId };
      const w = world({ state: { mapping: [other] } });
      expect(await handleFinish(event, w.ports)).toEqual({
        kind: "needs-choice",
        candidateIds: [scId],
      });
      expect(w.calls.slice(-1)).toEqual(["save"]);
      expect(w.calls.filter((c) => c === "save")).toHaveLength(1);
      expect(w.state.mapping).toEqual([other]);
      expect(w.state.pending).toEqual([
        { kind: "ambiguity", side: "naka", id: nakaId, candidateIds: [scId] },
      ]);
    },
  );

  it("a film never matches a series with the same title", async () => {
    const w = world({
      search: { "Le Film": [cand(FILM_SC, { ...FILM_TITLE, type: "serie" })] },
    });
    expect(await handleFinish(film(), w.ports)).toEqual({ kind: "not-found" });
  });

  it("a series never matches a film with the same title", async () => {
    const w = world({
      search: {
        "La Série": [cand(SERIES_SC, { ...SERIES_TITLE, type: "film" })],
      },
    });
    expect(await handleFinish(episode(1, 2), w.ports)).toEqual({
      kind: "not-found",
    });
    expect(w.calls.some((c) => c.startsWith("seasonInfo"))).toBe(false);
  });

  it("picks the film among a series and a film with the same title", async () => {
    const w = world({
      search: {
        "Le Film": [
          cand(3000, { ...FILM_TITLE, type: "serie" }),
          cand(FILM_SC, FILM_TITLE),
        ],
      },
    });
    expect((await handleFinish(film(), w.ports)).kind).toBe("done");
    expect(w.calls).toContain("productState:1042");
  });
});

describe("an open question about the same title wins over a fresh match", () => {
  const question = (
    side: "naka" | "sc",
    id: number,
    candidateIds: number[],
  ): PendingItem => ({ kind: "ambiguity", side, id, candidateIds });

  it("R5bis: the runner's open question on the film is returned as is: no search, no write, no save", async () => {
    const w = world({
      state: { pending: [question("naka", FILM, [FILM_SC, 2042])] },
    });
    expect(await handleFinish(film(), w.ports)).toEqual({
      kind: "needs-choice",
      candidateIds: [FILM_SC, 2042],
    });
    expect(w.calls).toEqual(["load"]);
    expect(w.saved).toEqual([]);
  });

  it("V3: the outcome gives the stored question's ids, not a fresh search's", async () => {
    const stored = question("naka", FILM, [FILM_SC, 2042]);
    const w = world({
      state: { pending: [stored] },
      search: {
        "Le Film": [
          cand(FILM_SC, FILM_TITLE),
          cand(2042, FILM_TITLE),
          cand(3042, FILM_TITLE),
        ],
      },
    });
    expect(await handleFinish(film(), w.ports)).toEqual({
      kind: "needs-choice",
      candidateIds: [FILM_SC, 2042],
    });
    expect(w.state.pending).toEqual([stored]);
  });

  it("V1: an open question on the series stops an episode before any season read or write", async () => {
    const w = world({
      state: { pending: [question("naka", SERIES, [SERIES_SC, 2007])] },
    });
    expect(await handleFinish(episode(1, 2), w.ports)).toEqual({
      kind: "needs-choice",
      candidateIds: [SERIES_SC, 2007],
    });
    expect(w.calls).toEqual(["load"]);
  });

  it("a mapped title with an open question on it is asked again: the question comes before the mapping", async () => {
    const w = world({
      state: {
        mapping: [FILM_PAIR],
        pending: [question("naka", FILM, [FILM_SC, 2042])],
      },
    });
    expect(await handleFinish(film(), w.ports)).toEqual({
      kind: "needs-choice",
      candidateIds: [FILM_SC, 2042],
    });
    expect(w.calls).toEqual(["load"]);
    expect(writesOf(w.calls)).toEqual([]);
  });

  it("a mapped title with an SC-side question on its product is finished: that rule needs a search match", async () => {
    const w = world({
      state: {
        mapping: [FILM_PAIR],
        pending: [question("sc", FILM_SC, [FILM, 43])],
      },
    });
    expect((await handleFinish(film(), w.ports)).kind).toBe("done");
  });

  it.each([
    ["a question on another Naka title", question("naka", 43, [FILM_SC])],
    [
      "a Naka-side question whose id is the product's",
      question("naka", FILM_SC, [1]),
    ],
    [
      "an SC-side question whose id is the Naka title's",
      question("sc", FILM, [7]),
    ],
    ["an SC-side question on another product", question("sc", 2042, [FILM])],
    [
      "a pending removal of the pair",
      { kind: "removal", removeFrom: "sc", pair: FILM_PAIR, asked: false },
    ],
  ] as [string, PendingItem][])(
    "%s does not stop the finish",
    async (_name, item) => {
      const w = world({ state: { pending: [item] } });
      expect((await handleFinish(film(), w.ports)).kind).toBe("done");
    },
  );

  it.each([
    ["film", film(), FILM, FILM_SC],
    ["series", episode(1, 2), SERIES, SERIES_SC],
  ] as const)(
    "a %s matching a product with an open SC-side question asks the owner, with no write",
    async (_name, event, nakaId, scId) => {
      const open = question("sc", scId, [nakaId, 99]);
      const w = world({ state: { pending: [open] } });
      expect(await handleFinish(event, w.ports)).toEqual({
        kind: "needs-choice",
        candidateIds: [scId],
      });
      expect(w.calls.slice(-1)).toEqual(["save"]);
      expect(w.calls.filter((c) => c === "save")).toHaveLength(1);
      expect(writesOf(w.calls)).toEqual([]);
      expect(w.state.mapping).toEqual([]);
      expect(w.state.pending).toEqual([open, question("naka", nakaId, [scId])]);
    },
  );
});
