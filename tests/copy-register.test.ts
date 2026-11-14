import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as ficheCopy from "../src/content/ui/fiche-copy";
import * as homeCopy from "../src/content/ui/home-copy";
import * as questionCopy from "../src/content/ui/question-copy";
import * as ratingCopy from "../src/content/ui/rating-copy";
import type { JobError } from "../src/ext/job-error";
import type { RunRecord } from "../src/ext/settings";
import { HANDLED_COPY } from "../src/status/handled-view";
import * as jobErrorLabels from "../src/status/job-error-labels";
import * as listsCopy from "../src/status/lists-copy";
import { SETTINGS_COPY } from "../src/status/settings-view";
import { ACTION_COPY, CONFIRM_TEXT } from "../src/status/status-actions";
import { localFormat } from "../src/status/status-format";
import * as statusModeCopy from "../src/status/status-mode-copy";
import { WAITING_LABELS } from "../src/status/status-owner-lines";
import { type StatusView, toStatusView } from "../src/status/status-view";
import type { UnlinkedOffer } from "../src/sw/question-offers";

// The owner is spoken to in one register, « tu », with the apostrophe ’ (U+2019): a shown sentence
// never holds U+0027, a « vous » word, or an imperative in « -ez ».
const VOUS_WORDS = /(?<!\p{L})(vous|votre|vos|vôtre|vôtres)(?!\p{L})/iu;
// « -ez » at a word's end, before a space, a sign or the end of the text; « chez », « assez »… are words.
const EZ_ENDING = /(?<!\p{L})(\p{L}*ez)(?=[\s\p{P}]|$)/giu;
const EZ_WORDS = new Set(["chez", "nez", "assez", "rez"]);

/** What breaks the register in one shown sentence; empty when it speaks in « tu » with ’. */
function registerFaults(text: string): string[] {
  const faults = text.includes("'") ? [`U+0027 in « ${text} »`] : [];
  const vous = text.match(VOUS_WORDS);
  if (vous) faults.push(`« ${vous[0]} » in « ${text} »`);
  for (const [word] of text.matchAll(EZ_ENDING)) {
    if (!EZ_WORDS.has(word.toLowerCase())) {
      faults.push(`« ${word} » in « ${text} »`);
    }
  }
  return faults;
}

/** Every string an exported table holds, however deep; functions are called below, by name. */
function tableStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(tableStrings);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(tableStrings);
  }
  return [];
}

// One sample call per exported copy function: a new export without one fails the compile.
type CopyCalls<M> = {
  [K in keyof M as M[K] extends (...args: never[]) => unknown
    ? K
    : never]: () => readonly string[];
};

const CODES = Object.keys(jobErrorLabels.JOB_ERROR_LABELS) as JobError[];
const REASONS: UnlinkedOffer["reason"][] = [
  "no-match",
  "not-in-catalogue",
  "none-chosen",
];

const RATING_CALLS: CopyCalls<typeof ratingCopy> = {
  filmHeading: () => [ratingCopy.filmHeading("Alien")],
  episodeHeading: () => [ratingCopy.episodeHeading("Dark", 2, 5)],
  seasonHeading: () => [ratingCopy.seasonHeading("Dark", 2)],
  seriesHeading: () => [ratingCopy.seriesHeading("Dark")],
  currentLine: () => [ratingCopy.currentLine(7)],
  seasonStartLine: () => [ratingCopy.seasonStartLine(8)],
  seriesStartLine: () => [ratingCopy.seriesStartLine(6)],
  errorLine: () => CODES.map(ratingCopy.errorLine),
  notSentLine: () => [
    ratingCopy.notSentLine(undefined),
    ratingCopy.notSentLine({ outcome: "needs-choice" }),
    ...CODES.map((error) =>
      ratingCopy.notSentLine({ outcome: "failed", error }),
    ),
  ],
  chosenLine: () => [ratingCopy.chosenLine(9)],
};

const QUESTION_CALLS: CopyCalls<typeof questionCopy> = {
  ambiguityHeading: () => [
    questionCopy.ambiguityHeading("naka", "Dune"),
    questionCopy.ambiguityHeading("sc", "Dune"),
  ],
  candidateLabel: () => [
    questionCopy.candidateLabel({
      id: 1,
      title: "Dune",
      year: 2021,
      type: "film",
    }),
    questionCopy.candidateLabel({ id: 2, title: "Dark", type: "serie" }),
  ],
  removalHeading: () => [
    questionCopy.removalHeading("sc", "Dune"),
    questionCopy.removalHeading("naka", "Dune"),
  ],
  removalQuestion: () => [
    questionCopy.removalQuestion("sc"),
    questionCopy.removalQuestion("naka"),
  ],
  removeLabel: () => [
    questionCopy.removeLabel("sc"),
    questionCopy.removeLabel("naka"),
  ],
  notSentLine: () => CODES.map(questionCopy.notSentLine),
};

const FICHE_CALLS: CopyCalls<typeof ficheCopy> = {
  averageLine: () => [ficheCopy.averageLine(7.4)],
  labelLine: () => [
    ficheCopy.labelLine({ title: "Dune", year: 2021 }),
    ficheCopy.labelLine({ title: "Dune" }),
  ],
  sentWithErrorLine: () => CODES.map(ficheCopy.sentWithErrorLine),
  episodeStarsName: () => [ficheCopy.episodeStarsName("Pilote")],
  outcomeLine: () => [
    ficheCopy.outcomeLine({ kind: "failed" }, ficheCopy.LINK_FAILED_LINE),
    ...CODES.flatMap((error) => [
      ficheCopy.outcomeLine({ kind: "not-sent", error }, ""),
      ficheCopy.outcomeLine({ kind: "sent-with-error", error }, ""),
    ]),
  ],
  seasonFailedLine: () => [ficheCopy.seasonFailedLine(2)],
};

const LISTS_CALLS: CopyCalls<typeof listsCopy> = {
  reasonLine: () => REASONS.map(listsCopy.reasonLine),
  unlinkedHeading: () => [
    listsCopy.unlinkedHeading("naka", "Dune"),
    listsCopy.unlinkedHeading("sc", "Dune"),
  ],
  searchErrorLine: () => CODES.map(listsCopy.searchErrorLine),
};

const MODE_CALLS: CopyCalls<typeof statusModeCopy> = {
  confirmText: () => [0, 1, 3].map(statusModeCopy.confirmText),
};

const calls = (table: Record<string, () => readonly string[]>): string[] =>
  Object.values(table).flatMap((call) => [...call()]);

// The status page's own lines, built from answers that reach each of them.
const AT = Date.UTC(2026, 10, 4, 14, 5);
const REPORT = {
  added: [{ nakaId: 1, scId: 1 }],
  deferred: [],
  failed: [],
  alreadyDone: [],
  pendingRemovals: 0,
  unresolved: 0,
};
const failedRun = (error: JobError): RunRecord => ({
  at: AT,
  trigger: "button",
  mode: "live",
  outcome: "failed",
  report: REPORT,
  error,
});
const SNAPSHOTS: unknown[] = [
  undefined,
  { mode: "simulation", pendingRatings: 0 },
  { mode: "live", pendingRatings: 3, pendingActions: ["forget", "reset"] },
  ...CODES.map((error) => ({ error })),
  ...CODES.map((error) => ({
    mode: "live",
    lastRun: failedRun(error),
    lastFinish: { at: AT, key: "movie:1", outcome: "failed", error },
  })),
];

function viewTexts(view: StatusView): string[] {
  if (view.kind !== "ready") return [view.message];
  return [view.headline, view.switchLabel ?? "", ...view.lines];
}

function statusPageTexts(): string[] {
  const format = localFormat("UTC");
  const html = readFileSync("src/status/status.html", "utf8");
  return [
    ...SNAPSHOTS.flatMap((s) => viewTexts(toStatusView(s, format))),
    ...tableStrings([ACTION_COPY, CONFIRM_TEXT, SETTINGS_COPY]),
    ...tableStrings([WAITING_LABELS, HANDLED_COPY]),
    HANDLED_COPY.heading(3),
    ...html.replace(/<[^>]*>/g, "\n").split("\n"),
  ];
}

function allShownTexts(): string[] {
  const modules = [
    ratingCopy,
    questionCopy,
    homeCopy,
    ficheCopy,
    listsCopy,
    statusModeCopy,
    jobErrorLabels,
  ];
  return [
    ...modules.flatMap(tableStrings),
    ...[
      RATING_CALLS,
      QUESTION_CALLS,
      FICHE_CALLS,
      LISTS_CALLS,
      MODE_CALLS,
    ].flatMap(calls),
    ...statusPageTexts(),
  ].filter((text) => text.trim() !== "");
}

describe("the register guard (control)", () => {
  it("passes a sentence in « tu » with ’", () => {
    expect(registerFaults("Ta note")).toEqual([]);
    expect(registerFaults("SensCritique n’a pas pu être lu.")).toEqual([]);
    expect(registerFaults("reconnecte-toi sur Naka")).toEqual([]);
    expect(registerFaults("Vosges, chez Naka, assez")).toEqual([]);
  });

  it("fails a « vous » word, an imperative in « -ez » and U+0027", () => {
    expect(registerFaults("Votre note")).toHaveLength(1);
    expect(registerFaults("l'état")).toHaveLength(1);
    expect(registerFaults("de vos envies")).toHaveLength(1);
    expect(registerFaults("réessayez plus tard")).toHaveLength(1);
    expect(registerFaults("changé de page, réessayez")).toHaveLength(1);
    expect(registerFaults("Vérifiez, puis rouvrez.")).toHaveLength(2);
    expect(registerFaults("Reconnectez-vous")).toHaveLength(2);
  });
});

describe("every shown sentence speaks in « tu » with ’", () => {
  it("in every copy table, copy function and status page line", () => {
    const all = allShownTexts();
    expect(all.length).toBeGreaterThan(150);
    expect(all.flatMap(registerFaults)).toEqual([]);
  });
});
