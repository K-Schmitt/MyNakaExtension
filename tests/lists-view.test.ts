import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  type ListRow,
  type ListsState,
  type SearchPhase,
  toListsView,
} from "../src/status/lists-view";
import {
  AMBIGUITY,
  LEGACY,
  LISTS,
  NB,
  REMOVAL,
  UNLINKED_NAKA,
  UNLINKED_SC,
} from "./lists-fixtures";

const view = (state: ListsState = EMPTY_STATE, answer = LISTS) =>
  toListsView(answer, state);
const row = (rows: ListRow[], key: string) => {
  const found = rows.find((r) => r.key === key);
  expect(found, `row ${key}`).toBeDefined();
  return found as ListRow;
};
const labels = (r: ListRow) => r.buttons.map((b) => b.label);

describe("the question rows", () => {
  it("a legacy question has its copy and one action, requeue", () => {
    const legacy = row(view().questions, LEGACY.key);
    expect(legacy.heading).toBe(
      "Question enregistrée par une version précédente, sans ses titres.",
    );
    expect(legacy.buttons).toEqual([
      {
        label: "Reposer la question",
        action: { kind: "requeue", side: "naka", id: 9 },
      },
    ]);
  });

  it("an ambiguity lists its candidates and « Aucun de ceux-là », each answering by id", () => {
    const r = row(view().questions, AMBIGUITY.key);
    expect(r.heading).toBe(
      `Quel titre SensCritique correspond à «${NB}Alien${NB}»${NB}?`,
    );
    expect(labels(r)).toEqual([
      "Alien (1979, film)",
      "Aliens (1986, film)",
      "Aucun de ceux-là",
    ]);
    expect(r.buttons.map((b) => b.action)).toEqual([
      { kind: "answer-question", side: "naka", id: 7, choice: 70 },
      { kind: "answer-question", side: "naka", id: 7, choice: 71 },
      { kind: "answer-question", side: "naka", id: 7, choice: null },
    ]);
    expect(r.lines).toEqual([]);
  });

  it("a hidden removal says so and keeps both answer buttons", () => {
    const r = row(view().questions, REMOVAL.key);
    expect(r.lines).toContain("Écartée de l’accueil");
    expect(r.question).toBe(`Retirer aussi de tes envies SensCritique${NB}?`);
    expect(r.buttons).toEqual([
      {
        label: "Retirer aussi de tes envies SensCritique",
        action: {
          kind: "answer-removal",
          removeFrom: "sc",
          nakaId: 3,
          scId: 30,
          remove: true,
        },
      },
      {
        label: "Non",
        action: {
          kind: "answer-removal",
          removeFrom: "sc",
          nakaId: 3,
          scId: 30,
          remove: false,
        },
      },
    ]);
  });

  it("a visible question does not say it is set aside", () => {
    const answer = { ...LISTS, questions: [{ ...REMOVAL, hidden: false }] };
    expect(view(EMPTY_STATE, answer).questions[0]?.lines).toEqual([]);
  });

  it("no lists, no rows", () => {
    expect(toListsView(undefined, EMPTY_STATE)).toEqual({
      questions: [],
      unlinked: [],
      note: "",
    });
  });
});

describe("the unlinked rows", () => {
  it("name the title, the list it is in, and why it is not linked", () => {
    const naka = row(view().unlinked, UNLINKED_NAKA.key);
    expect(naka.heading).toBe("Dune — dans Ma liste Naka");
    expect(naka.lines).toEqual(["Aucun titre correspondant trouvé"]);
    expect(labels(naka)).toEqual(["Chercher"]);
  });

  it("an sc entry with no title reads « (titre inconnu) »", () => {
    const sc = row(view().unlinked, UNLINKED_SC.key);
    expect(sc.heading).toBe("(titre inconnu) — dans tes envies SensCritique");
    expect(sc.lines).toEqual(["Aucun des titres proposés n’a été retenu"]);
  });

  it("each reason has its line", () => {
    const answer = {
      ...LISTS,
      unlinked: [{ ...UNLINKED_NAKA, reason: "not-in-catalogue" as const }],
    };
    expect(view(EMPTY_STATE, answer).unlinked[0]?.lines).toEqual([
      "Titre illisible sur le site",
    ]);
  });
});

describe("the search of an unlinked row", () => {
  const open = (phase: SearchPhase = { kind: "idle" }): ListsState => ({
    ...EMPTY_STATE,
    search: { key: UNLINKED_NAKA.key, query: "Dune", phase },
  });
  const searchOf = (state: ListsState) =>
    row(view(state).unlinked, UNLINKED_NAKA.key).search;

  it("is closed by default, and only on the open row", () => {
    expect(searchOf(EMPTY_STATE)).toBeUndefined();
    expect(row(view(open()).unlinked, UNLINKED_SC.key).search).toBeUndefined();
  });

  it("opens with the title in the field", () => {
    expect(searchOf(open())).toEqual({ query: "Dune", results: [] });
  });

  it("says « Recherche… » while searching", () => {
    expect(searchOf(open({ kind: "searching" }))?.message).toBe(
      "Recherche\u2026",
    );
  });

  it("lists the results with « Relier », linking to the item's own side and id", () => {
    const candidates = [
      { id: 2005, title: "Dune", year: 2021, type: "film" as const },
      { id: 2006, title: "Dune", type: "serie" as const },
    ];
    const found = searchOf(open({ kind: "results", candidates }));
    expect(found?.results.map((r) => r.label)).toEqual([
      "Dune (2021, film)",
      "Dune (série)",
    ]);
    expect(found?.results[0]?.relier).toEqual({
      label: "Relier",
      aria: "Relier Dune (2021, film)",
      action: { kind: "link", side: "naka", id: 5, otherId: 2005 },
    });
    expect(found?.message).toBeUndefined();
  });

  it("says « Aucun résultat » for an empty list", () => {
    const found = searchOf(open({ kind: "results", candidates: [] }));
    expect(found?.message).toBe("Aucun résultat");
    expect(found?.results).toEqual([]);
  });

  it("words an error with the lowercase label after the colon", () => {
    const found = searchOf(open({ kind: "error", error: "sc-session" }));
    expect(found?.message).toBe(
      `Recherche impossible${NB}: reconnecte-toi sur SensCritique.`,
    );
  });

  it("an empty query shows its message on the field", () => {
    expect(searchOf(open({ kind: "empty-query" }))?.fieldError).toBe(
      "Un titre à chercher",
    );
  });
});

describe("a row being answered", () => {
  it("shows « Envoi de la réponse… » and no button, for a key in answering", () => {
    const r = row(
      view(EMPTY_STATE, { ...LISTS, answering: [AMBIGUITY.key] }).questions,
      AMBIGUITY.key,
    );
    expect(r.lines).toEqual(["Envoi de la réponse\u2026"]);
    expect(r.buttons).toEqual([]);
  });

  it("locks the same way while the page itself is sending, and only that row", () => {
    const rows = view({ ...EMPTY_STATE, busy: [LEGACY.key] }).questions;
    expect(row(rows, LEGACY.key).buttons).toEqual([]);
    expect(row(rows, REMOVAL.key).buttons).toHaveLength(2);
  });

  it("an open search is not drawn on a locked row", () => {
    const state: ListsState = {
      ...EMPTY_STATE,
      search: {
        key: UNLINKED_NAKA.key,
        query: "Dune",
        phase: { kind: "idle" },
      },
    };
    const answer = { ...LISTS, answering: [UNLINKED_NAKA.key] as string[] };
    const r = row(
      view(state, answer as typeof LISTS).unlinked,
      UNLINKED_NAKA.key,
    );
    expect(r.search).toBeUndefined();
    expect(r.buttons).toEqual([]);
  });

  it("a send that did not reach the worker says so, on its row", () => {
    const r = row(
      view({ ...EMPTY_STATE, unsent: [LEGACY.key] }).questions,
      LEGACY.key,
    );
    expect(r.lines).toEqual([
      `La réponse n’est pas partie${NB}: l’extension ne répond pas.`,
    ]);
    expect(labels(r)).toEqual(["Reposer la question"]);
  });
});

describe("the last answer", () => {
  const last = (outcome: string, extra = {}, target = AMBIGUITY.key) => ({
    ...LISTS,
    lastAnswer: { seq: 4, at: 1, target, outcome, ...extra } as never,
  });

  it("failed, refused and mismatch show their line on the row of the target", () => {
    const failed = view(EMPTY_STATE, last("failed", { error: "unavailable" }));
    expect(row(failed.questions, AMBIGUITY.key).lines).toEqual([
      `La réponse n’est pas partie${NB}: le site ne répond pas, réessaie plus tard.`,
    ]);
    const refused = view(EMPTY_STATE, last("refused"));
    expect(row(refused.questions, AMBIGUITY.key).lines).toEqual([
      `La réponse n’a pas été prise en compte${NB}: la question a changé.`,
    ]);
    const mismatch = view(EMPTY_STATE, last("mismatch", {}, UNLINKED_NAKA.key));
    expect(row(mismatch.unlinked, UNLINKED_NAKA.key).lines).toEqual([
      "Aucun titre correspondant trouvé",
      `Ce titre n’est pas du même type${NB}: un film ne se relie qu’à un film, une série qu’à une série.`,
    ]);
  });

  it("another row's target shows nothing here", () => {
    const rows = view(EMPTY_STATE, last("refused")).questions;
    expect(row(rows, REMOVAL.key).lines).toEqual(["Écartée de l’accueil"]);
  });

  it("done shows no line", () => {
    const rows = view(EMPTY_STATE, last("done")).questions;
    expect(row(rows, AMBIGUITY.key).lines).toEqual([]);
  });

  it("moot goes to the page note, only when it is news", () => {
    const answer = last("moot", {}, REMOVAL.key);
    expect(view({ ...EMPTY_STATE, seenSeq: 3 }, answer).note).toBe(
      `Rien à retirer${NB}: ce titre n’y est déjà plus.`,
    );
    expect(view({ ...EMPTY_STATE, seenSeq: 4 }, answer).note).toBe("");
    expect(view(EMPTY_STATE, answer).note).toBe("");
  });

  it("moot puts no line on a row", () => {
    const rows = view(
      { ...EMPTY_STATE, seenSeq: 0 },
      last("moot", {}, REMOVAL.key),
    ).questions;
    expect(row(rows, REMOVAL.key).lines).toEqual(["Écartée de l’accueil"]);
  });
});
