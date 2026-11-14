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
      error: "unavailable",
    },
    {
      partial: { done: [], failed: { kind: "markDoneWithoutDate" } },
      error: "other-account",
    },
    {
      partial: {
        done: [{ kind: "maListe" }],
        failed: { kind: "localRestore" },
      },
      error: "stored-state",
    },
  ])("reads %j as itself", (raw) => {
    expect(parseUndoAnswer(raw)).toEqual(raw);
  });

  it.each([
    ["a bad « Ma liste »", { ok: true, maListe: "page" }],
    ["ok without « Ma liste »", { ok: true }],
    ["an extra key on ok", { ok: true, maListe: "tab", x: 1 }],
    ["a removal's refusal", { refused: "unrated" }],
    ["a bad error", { error: "nope" }],
    [
      "a partial without its error",
      { partial: { done: [], failed: { kind: "wish" } } },
    ],
    [
      "a refused-protected step",
      {
        partial: { done: [], failed: { kind: "refused-protected" } },
        error: "unavailable",
      },
    ],
    [
      "a rating of 11",
      {
        partial: { done: [], failed: { kind: "rate", rating: 11 } },
        error: "unavailable",
      },
    ],
    [
      "a bad date",
      {
        partial: { done: [], failed: { kind: "markDone", date: "2 mars" } },
        error: "unavailable",
      },
    ],
    [
      "a step with an extra key",
      {
        partial: { done: [], failed: { kind: "wish", rating: 2 } },
        error: "unavailable",
      },
    ],
    [
      "a done list of text",
      {
        partial: { done: "undone", failed: { kind: "wish" } },
        error: "unavailable",
      },
    ],
    ["not a record", "ok"],
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
