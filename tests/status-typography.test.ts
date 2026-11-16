import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JobError } from "../src/ext/job-error";
import type { RunRecord } from "../src/ext/settings";
import { HANDLED_COPY } from "../src/status/handled-view";
import { JOB_ERROR_LABELS } from "../src/status/job-error-labels";
import { LISTS_COPY } from "../src/status/lists-copy";
import {
  EMPTY_STATE,
  type ListRow,
  type ListsState,
  type SearchPhase,
  toListsView,
} from "../src/status/lists-view";
import { SETTINGS_COPY, toSettingsView } from "../src/status/settings-view";
import { CONFIRM_TEXT } from "../src/status/status-actions";
import { localFormat } from "../src/status/status-format";
import { confirmText } from "../src/status/status-mode-copy";
import { type StatusView, toStatusView } from "../src/status/status-view";
import type { StatusSnapshot } from "../src/sw/status-snapshot";
import { AMBIGUITY, LISTS, REMOVAL, UNLINKED_NAKA } from "./lists-fixtures";

// French typography (Ruling 19): U+202F NARROW NO-BREAK SPACE before « : », « ; », « ? » and « ! », and
// inside « ». A colon between digits (a time, 14:05) takes none.
const NB = "\u202F";

// Every place where a sentence of the page breaks the rule: a plain or no-break space before the
// punctuation, the punctuation glued to a word, or a guillemet without its narrow space.
function typographyFaults(text: string): string[] {
  const faults = [
    ...text.matchAll(/(?<![\u202F\d]):|(?<!\u202F)[;?!%]/g),
    ...text.matchAll(/«(?!\u202F)|(?<!\u202F)»/g),
  ];
  return faults.map((m) => text.slice(Math.max(0, m.index - 12), m.index + 2));
}

const AT = Date.UTC(2026, 10, 4, 14, 5);
const CODES = Object.keys(JOB_ERROR_LABELS) as JobError[];
const pairs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ nakaId: i + 1, scId: i + 1 }));
const REPORT = {
  added: pairs(2),
  deferred: pairs(1),
  failed: pairs(0),
  alreadyDone: pairs(3),
  pendingRemovals: 0,
  unresolved: 4,
};
const run = (extra: Partial<RunRecord>): RunRecord => ({
  at: AT,
  trigger: "button",
  mode: "simulation",
  outcome: "ok",
  report: REPORT,
  ...extra,
});

// Every kind of sentence the page can show, with plain remote text.
const SNAPSHOTS: StatusSnapshot[] = [
  ...CODES.map((error) => ({ error })),
  ...CODES.map((error) => ({
    mode: "live" as const,
    lastRun: run({ outcome: "failed", error }),
    lastFinish: { at: AT, key: "movie:1", outcome: "failed" as const, error },
  })),
  {
    mode: "simulation",
    binding: { scUsername: "owner", nakaAccount: "77" },
    lastRun: run({
      error: "unavailable",
      preview: [
        { side: "sc", title: "Alien", year: 1979, type: "film" },
        { side: "naka", title: "" },
      ],
      next: [{ side: "naka", title: "Dune", year: 2021, type: "serie" }],
    }),
    lastFinish: {
      at: AT,
      key: "tv:21391:S1E3",
      outcome: "done",
      title: "Un Job Mortel",
    },
    counts: { pendingRemovals: 1, openQuestions: 2, unlinked: 3 },
    running: { kind: "sync", since: AT },
    pendingMode: "live",
  },
  {
    mode: "live",
    lastRun: run({ mode: "live", report: { ...REPORT, failed: pairs(2) } }),
    counts: { pendingRemovals: 0, openQuestions: 0, unlinked: 0 },
    running: { kind: "finish", since: AT },
    pendingMode: "simulation",
  },
  { mode: "live", pendingActions: ["forget", "reset"] },
  { mode: "live", pendingRatings: 0 },
  { mode: "live", pendingRatings: 3 },
  { mode: "live", firstRunPending: true },
  { mode: "simulation", firstRunPending: true },
];

function texts(view: StatusView): string[] {
  if (view.kind !== "ready") return [view.message];
  return [
    view.headline,
    view.firstRunLine ?? "",
    ...view.lines,
    ...view.preview,
    ...view.next,
  ];
}

describe("French typography on the status page", () => {
  it("the check finds a plain space, a glued sign and a bare guillemet (control)", () => {
    expect(typographyFaults("Prévus : 2")).toHaveLength(1);
    expect(typographyFaults("Prévus\u00A0: 2")).toHaveLength(1);
    expect(typographyFaults("80 %")).toHaveLength(1);
    expect(typographyFaults("80%")).toHaveLength(1);
    expect(typographyFaults("80\u00A0%")).toHaveLength(1);
    expect(typographyFaults(`80${NB}%`)).toEqual([]);
    expect(typographyFaults("Activer ?")).toHaveLength(1);
    expect(typographyFaults("Prévus: 2")).toHaveLength(1);
    expect(typographyFaults("« Resynchroniser »")).toHaveLength(2);
    expect(typographyFaults(`Prévus${NB}: 2 à 14:05`)).toEqual([]);
    expect(typographyFaults(`«${NB}Resynchroniser${NB}»${NB}?`)).toEqual([]);
  });

  it("every sentence of every view follows it", () => {
    const format = localFormat("UTC");
    const all = SNAPSHOTS.flatMap((s) => texts(toStatusView(s, format)));
    expect(all.length).toBeGreaterThan(80);
    expect(all.flatMap(typographyFaults)).toEqual([]);
  });

  it("every error label, both confirmations and the silent-engine state follow it", () => {
    const all = [
      ...Object.values(JOB_ERROR_LABELS),
      confirmText(0),
      confirmText(1),
      confirmText(3),
      ...Object.values(CONFIRM_TEXT),
      ...texts(toStatusView(undefined, localFormat("UTC"))),
    ];
    expect(all.flatMap(typographyFaults)).toEqual([]);
  });

  it("every label of the settings follows it, and the percentages use U+202F", () => {
    const view = toSettingsView({ film: 0.9, episode: 0.8 }, 0);
    const all = [
      ...Object.values(SETTINGS_COPY),
      ...view.options.map((o) => o.label),
    ];
    expect(all.flatMap(typographyFaults)).toEqual([]);
    for (const option of view.options) {
      expect([...option.label].map((c) => c.codePointAt(0))).toEqual([
        option.label.codePointAt(0),
        option.label.codePointAt(1),
        0x202f,
        0x25,
      ]);
    }
  });

  it("the page's own text follows it", () => {
    const html = readFileSync("src/status/status.html", "utf8");
    // A browser reads the numeric reference as the character; the check reads it the same way.
    const shown = html
      .replace(/<[^>]*>/g, " ")
      .replaceAll("&#8239;", String.fromCodePoint(0x202f));
    expect(typographyFaults(shown)).toEqual([]);
  });

  it("the handled section copy follows it", () => {
    const all = [
      HANDLED_COPY.forget,
      HANDLED_COPY.waiting,
      HANDLED_COPY.cancel,
      HANDLED_COPY.heading(3),
    ];
    expect(all.flatMap(typographyFaults)).toEqual([]);
  });

  it("every sentence of the question and unlinked rows follows it", () => {
    const searching = (phase: SearchPhase): ListsState => ({
      ...EMPTY_STATE,
      search: { key: UNLINKED_NAKA.key, query: "Dune", phase },
    });
    const phases: SearchPhase[] = [
      { kind: "idle" },
      { kind: "empty-query" },
      { kind: "searching" },
      { kind: "results", candidates: [] },
      {
        kind: "results",
        candidates: [{ id: 1, title: "Dune", year: 2021, type: "film" }],
      },
      ...CODES.map((error) => ({ kind: "error" as const, error })),
    ];
    const outcomes = CODES.map((error) => ({
      seq: 1,
      at: 1,
      target: AMBIGUITY.key,
      outcome: "failed" as const,
      error,
    }));
    const plain = ["refused", "mismatch", "moot"].map((outcome) => ({
      seq: 1,
      at: 1,
      target: AMBIGUITY.key,
      outcome: outcome as "refused",
    }));
    const rowTexts = (row: ListRow): string[] => [
      row.heading,
      row.question ?? "",
      ...row.lines,
      ...row.buttons.flatMap((b) => [b.label, b.aria ?? ""]),
      row.search?.fieldError ?? "",
      row.search?.message ?? "",
      ...(row.search?.results.flatMap((r) => [
        r.label,
        r.relier.label,
        r.relier.aria ?? "",
      ]) ?? []),
    ];
    const views = [
      ...phases.map((p) => toListsView(LISTS, searching(p))),
      ...[...outcomes, ...plain].map((lastAnswer) =>
        toListsView({ ...LISTS, lastAnswer }, { ...EMPTY_STATE, seenSeq: 0 }),
      ),
      toListsView({ ...LISTS, answering: [REMOVAL.key] }, EMPTY_STATE),
      toListsView(LISTS, { ...EMPTY_STATE, unsent: [AMBIGUITY.key] }),
    ];
    const all = [
      ...Object.values(LISTS_COPY),
      ...views.flatMap((v) => [
        v.note,
        ...[...v.questions, ...v.unlinked].flatMap(rowTexts),
      ]),
    ];
    expect(
      all.filter((text) => text.includes("\u202F")).length,
    ).toBeGreaterThan(20);
    expect(all.flatMap(typographyFaults)).toEqual([]);
  });
});

describe("the reset confirmation", () => {
  it("keeps the mode and promises a click, with no simulation fallback", () => {
    const text = CONFIRM_TEXT.reset;
    expect(text).not.toContain("repasse en simulation");
    expect(text).not.toContain("réactiver les écritures");
    expect(text).toContain(`«${NB}Resynchroniser${NB}»`);
    expect(text).toContain("Le mode, les réglages");
  });
});
