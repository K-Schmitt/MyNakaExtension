import { describe, expect, it } from "vitest";
import {
  ACTION_LABELS,
  CANCEL_LABEL,
  chosenLine,
  currentLine,
  episodeHeading,
  errorLine,
  filmHeading,
  NEEDS_CHOICE_LINE,
  NOT_RATED_LINE,
  OTHER_LABELS,
  SEND_LABEL,
  SENDING_LINE,
  SERIES_WARNING,
  seasonHeading,
  seasonStartLine,
  seriesHeading,
  seriesStartLine,
  UNREACHABLE_LINE,
} from "../src/content/ui/rating-copy";
import type { JobError } from "../src/ext/job-error";
import { JOB_ERROR_LABELS } from "../src/status/job-error-labels";

const NB = "\u202F";

// Same rule as the status page: a sign before « : ; ? ! » and a guillemet need U+202F.
function typographyFaults(text: string): string[] {
  const faults = [
    ...text.matchAll(/(?<![\u202F\d]):|(?<!\u202F)[;?!]/g),
    ...text.matchAll(/«(?!\u202F)|(?<!\u202F)»/g),
  ];
  return faults.map((m) => text.slice(Math.max(0, m.index - 12), m.index + 2));
}

const CODES = Object.keys(JOB_ERROR_LABELS) as JobError[];

describe("the rating copy, code point by code point", () => {
  it("headings", () => {
    expect(filmHeading("Alien")).toBe(`Noter «${NB}Alien${NB}»`);
    expect(episodeHeading("Dark", 2, 5)).toBe(
      `Noter «${NB}Dark${NB}», saison 2, épisode 5`,
    );
    expect(seasonHeading("Dark", 2)).toBe(
      `Noter la saison 2 de «${NB}Dark${NB}»`,
    );
    expect(seriesHeading("Dark")).toBe(`Noter la série «${NB}Dark${NB}»`);
  });

  it("current, start and warning", () => {
    expect(currentLine(7)).toBe(`Votre note actuelle${NB}: 7`);
    expect(seasonStartLine(8)).toBe(`Moyenne de vos épisodes${NB}: 8`);
    expect(seriesStartLine(6)).toBe(`Moyenne de vos saisons${NB}: 6`);
    expect(SERIES_WARNING).toBe(
      `Noter la série la retire de vos envies SensCritique, et elle n'est pas finie sur Naka. Envoyer quand même${NB}?`,
    );
  });

  it("buttons", () => {
    expect(ACTION_LABELS).toEqual({
      "plus-tard": "Plus tard",
      ignorer: "Ignorer",
      fermer: "Fermer",
    });
    expect([SEND_LABEL, CANCEL_LABEL]).toEqual(["Envoyer", "Annuler"]);
    expect(OTHER_LABELS.épisode).toBe("Noter l'épisode");
    expect(OTHER_LABELS.saison).toBe("Noter la saison");
    expect(OTHER_LABELS.série).toBe("Noter la série");
  });

  it("the sending and unreachable lines", () => {
    expect(SENDING_LINE).toBe("Envoi de la note\u2026");
    expect(UNREACHABLE_LINE).toBe(
      `La note n'est pas partie${NB}: l'extension ne répond pas.`,
    );
  });

  it("the lines of a card-less rating that did not go", () => {
    expect(NEEDS_CHOICE_LINE).toBe(
      `La note n'est pas partie${NB}: plusieurs titres correspondent sur SensCritique.`,
    );
    expect(NOT_RATED_LINE).toBe(
      `La note n'est pas partie${NB}: ce titre n'a pas pu être noté.`,
    );
  });

  it("the chosen line", () => {
    expect(chosenLine(7)).toBe(`Note choisie${NB}: 7`);
  });

  it("the error line reuses the job error labels", () => {
    for (const code of CODES) {
      expect(errorLine(code)).toBe(
        `La note n'est pas partie${NB}: ${JOB_ERROR_LABELS[code]}`,
      );
    }
  });

  it("the check finds a plain space before a sign (control)", () => {
    expect(typographyFaults("Votre note actuelle : 7")).toHaveLength(1);
    expect(typographyFaults("Noter « Alien »")).toHaveLength(2);
    expect(typographyFaults("quand même ?")).toHaveLength(1);
  });

  it("every string follows the typography rule", () => {
    const all = [
      filmHeading("Alien"),
      episodeHeading("Dark", 2, 5),
      seasonHeading("Dark", 2),
      seriesHeading("Dark"),
      currentLine(7),
      seasonStartLine(8),
      seriesStartLine(6),
      SERIES_WARNING,
      ...Object.values(ACTION_LABELS),
      ...Object.values(OTHER_LABELS),
      SEND_LABEL,
      CANCEL_LABEL,
      SENDING_LINE,
      UNREACHABLE_LINE,
      NEEDS_CHOICE_LINE,
      NOT_RATED_LINE,
      chosenLine(7),
      ...CODES.map(errorLine),
    ];
    expect(all.flatMap(typographyFaults)).toEqual([]);
  });
});
