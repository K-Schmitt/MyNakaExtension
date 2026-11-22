import { describe, expect, it } from "vitest";
import {
  parseRemoveAnswer,
  parseUndoAnswer,
} from "../src/ext/fiche-undo-answers";

describe("the undo answer", () => {
  it.each([
    { ok: true, maListe: "tab" },
    { ok: true, maListe: "client" },
    { ok: true, maListe: "none" },
    { ok: true, maListe: "none", dejaVu: "tab" },
    {
      partial: { done: [{ kind: "dejaVu" }], failed: { kind: "localRestore" } },
      maListe: "none",
      dejaVu: "tab",
      error: "unavailable",
    },
    { refused: "protected" },
    { refused: "expired" },
    { error: "sc-session" },
    {
      partial: {
        done: [
          { kind: "undone" },
          { kind: "markDone", date: "2024-03-02" },
          { kind: "rate", rating: 6 },
        ],
        failed: { kind: "wish" },
      },
      maListe: "none",
      error: "unavailable",
    },
    {
      partial: { done: [], failed: { kind: "markDoneWithoutDate" } },
      maListe: "none",
      error: "other-account",
    },
    {
      partial: { done: [{ kind: "maListe" }], failed: { kind: "dejaVu" } },
      maListe: "client",
      error: "unavailable",
    },
    {
      partial: {
        done: [{ kind: "maListe" }],
        failed: { kind: "localRestore" },
      },
      maListe: "tab",
      error: "stored-state",
    },
  ])("reads %j as itself", (raw) => {
    expect(parseUndoAnswer(raw)).toEqual(raw);
  });

  it.each([
    ["a bad « Ma liste »", { ok: true, maListe: "page" }],
    ["ok without « Ma liste »", { ok: true }],
    ["an extra key on ok", { ok: true, maListe: "tab", x: 1 }],
    ["a bad dejaVu on ok", { ok: true, maListe: "none", dejaVu: "client" }],
    [
      "a bad dejaVu on a partial",
      {
        partial: { done: [], failed: { kind: "wish" } },
        maListe: "none",
        dejaVu: "none",
        error: "unavailable",
      },
    ],
    ["a removal's refusal", { refused: "unrated" }],
    ["a bad error", { error: "nope" }],
    [
      "a partial without its error",
      { partial: { done: [], failed: { kind: "wish" } }, maListe: "none" },
    ],
    [
      "a refused-protected step",
      {
        partial: { done: [], failed: { kind: "refused-protected" } },
        maListe: "none",
        error: "unavailable",
      },
    ],
    [
      "a rating of 11",
      {
        partial: { done: [], failed: { kind: "rate", rating: 11 } },
        maListe: "none",
        error: "unavailable",
      },
    ],
    [
      "a bad date",
      {
        partial: { done: [], failed: { kind: "markDone", date: "2 mars" } },
        maListe: "none",
        error: "unavailable",
      },
    ],
    [
      "a « vu » step with no date",
      {
        partial: { done: [], failed: { kind: "markDone", date: null } },
        maListe: "none",
        error: "unavailable",
      },
    ],
    [
      "a step with an extra key",
      {
        partial: { done: [], failed: { kind: "wish", rating: 2 } },
        maListe: "none",
        error: "unavailable",
      },
    ],
    [
      "a done list of text",
      {
        partial: { done: "undone", failed: { kind: "wish" } },
        maListe: "none",
        error: "unavailable",
      },
    ],
    ["not a record", "ok"],
    [
      "a partial without « Ma liste »",
      {
        partial: { done: [], failed: { kind: "wish" } },
        error: "unavailable",
      },
    ],
    [
      "a partial with a bad « Ma liste »",
      {
        partial: { done: [], failed: { kind: "wish" } },
        maListe: "page",
        error: "unavailable",
      },
    ],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseUndoAnswer(raw)).toThrow();
  });
});

describe("the removal answer", () => {
  it.each([
    { ok: true },
    { refused: "protected" },
    { refused: "unrated" },
    { error: "unavailable" },
  ])("reads %j as itself", (raw) => {
    expect(parseRemoveAnswer(raw)).toEqual(raw);
  });

  it.each([
    ["an undo's refusal", { refused: "expired" }],
    ["ok with « Ma liste »", { ok: true, maListe: "tab" }],
    ["ok false", { ok: false }],
    ["an error and ok", { ok: true, error: "unavailable" }],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseRemoveAnswer(raw)).toThrow();
  });
});
