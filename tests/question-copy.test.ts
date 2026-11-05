import { describe, expect, it } from "vitest";
import {
  ACTION_LABELS,
  ambiguityHeading,
  candidateLabel,
  KEEP_LABEL,
  MISMATCH_LINE,
  MOOT_LINE,
  NONE_LABEL,
  notSentLine,
  REFUSED_LINE,
  removalHeading,
  removalQuestion,
  removeLabel,
  SENDING_LINE,
  UNKNOWN_TITLE,
  UNREACHABLE_LINE,
} from "../src/content/ui/question-copy";
import { RATING_ERROR_LABELS } from "../src/content/ui/rating-copy";

const NB = "\u202F";
const points = (s: string): string[] =>
  [...s].map((c) => c.codePointAt(0)?.toString(16) ?? "");

describe("the question copy", () => {
  it("asks the ambiguity on each side, with U+202F inside the quotes and before the mark", () => {
    expect(ambiguityHeading("naka", "Dune")).toBe(
      `Quel titre SensCritique correspond à «${NB}Dune${NB}»${NB}?`,
    );
    expect(ambiguityHeading("sc", "Dune")).toBe(
      `Quel titre Naka correspond à «${NB}Dune${NB}»${NB}?`,
    );
    expect(points(ambiguityHeading("sc", "A"))).toContain("202f");
  });

  it("words a candidate with its year and kind, or without the year", () => {
    expect(
      candidateLabel({ id: 1, title: "Dune", year: 2021, type: "film" }),
    ).toBe("Dune (2021, film)");
    expect(
      candidateLabel({ id: 1, title: "Dune", year: 2021, type: "serie" }),
    ).toBe("Dune (2021, série)");
    expect(candidateLabel({ id: 1, title: "Dune", type: "film" })).toBe(
      "Dune (film)",
    );
    expect(candidateLabel({ id: 1, title: "Dune", type: "serie" })).toBe(
      "Dune (série)",
    );
  });

  it("words the removal for each side", () => {
    expect(removalHeading("sc", "Dune")).toBe(
      `«${NB}Dune${NB}» a quitté Ma liste Naka.`,
    );
    expect(removalQuestion("sc")).toBe(
      `Retirer aussi de vos envies SensCritique${NB}?`,
    );
    expect(removeLabel("sc")).toBe("Retirer aussi de vos envies SensCritique");
    expect(removalHeading("naka", "Dune")).toBe(
      `«${NB}Dune${NB}» a quitté vos envies SensCritique.`,
    );
    expect(removalQuestion("naka")).toBe(
      `Retirer aussi de Ma liste Naka${NB}?`,
    );
    expect(removeLabel("naka")).toBe("Retirer aussi de Ma liste Naka");
    expect(KEEP_LABEL).toBe("Non");
  });

  it("words the fixed labels and lines", () => {
    expect(NONE_LABEL).toBe("Aucun de ceux-là");
    expect(ACTION_LABELS).toEqual({
      "plus-tard": "Plus tard",
      ecarter: "Écarter",
      fermer: "Fermer",
    });
    expect(SENDING_LINE).toBe("Envoi de la réponse\u2026");
    expect(points(SENDING_LINE).at(-1)).toBe("2026");
    expect(MOOT_LINE).toBe(`Rien à retirer${NB}: ce titre n'y est déjà plus.`);
    expect(REFUSED_LINE).toBe(
      `La réponse n'a pas été prise en compte${NB}: la question a changé.`,
    );
    expect(MISMATCH_LINE).toBe(
      `Ce titre n'est pas du même type${NB}: un film ne se relie qu'à un film, une série qu'à une série.`,
    );
    expect(UNREACHABLE_LINE).toBe(
      `La réponse n'est pas partie${NB}: l'extension ne répond pas.`,
    );
    expect(UNKNOWN_TITLE).toBe("(titre inconnu)");
  });

  it("gives the reason of a failed answer from the rating labels", () => {
    expect(notSentLine("sc-session")).toBe(
      `La réponse n'est pas partie${NB}: ${RATING_ERROR_LABELS["sc-session"]}.`,
    );
    expect(notSentLine("naka-list-empty")).toContain(
      RATING_ERROR_LABELS["naka-list-empty"],
    );
  });
});
