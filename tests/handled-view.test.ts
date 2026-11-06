import { describe, expect, it } from "vitest";
import { HANDLED_COPY, toHandledView } from "../src/status/handled-view";

const NBSP = "\u00a0";

describe("toHandledView", () => {
  it("lists the items in the worker's order under « Titres traités (n) »", () => {
    const titles = [
      { key: "tv:5:S1E1", label: "Une série · saison 1, épisode 1" },
      { key: "movie:21391", label: `Contenu Naka n°${NBSP}21391` },
    ];
    expect(toHandledView({ titles })).toEqual({
      kind: "list",
      heading: "Titres traités (2)",
      items: titles,
      waiting: [],
    });
  });

  it("the heading copy is exact, in code points", () => {
    const heading = HANDLED_COPY.heading(12);
    expect([...heading].map((c) => c.codePointAt(0))).toEqual(
      [..."Titres traités (12)"].map((c) => c.codePointAt(0)),
    );
    expect(HANDLED_COPY.forget).toBe("Oublier");
  });

  it("an empty list hides the section", () => {
    expect(toHandledView({ titles: [] })).toEqual({ kind: "none" });
    expect(toHandledView({ titles: [], waiting: [] })).toEqual({
      kind: "none",
    });
  });

  it("parses the waiting finishes and the heading counts the handled titles only", () => {
    const waiting = [{ key: "movie:9", label: "Un film" }];
    expect(
      toHandledView({
        titles: [{ key: "movie:1", label: "A" }],
        waiting,
      }),
    ).toEqual({
      kind: "list",
      heading: "Titres traités (1)",
      items: [{ key: "movie:1", label: "A" }],
      waiting,
    });
  });

  it("a list with waiting finishes only still shows, with a zero count", () => {
    const waiting = [{ key: "movie:9", label: "Un film" }];
    expect(toHandledView({ titles: [], waiting })).toEqual({
      kind: "list",
      heading: "Titres traités (0)",
      items: [],
      waiting,
    });
  });

  it("the waiting and cancel copy is exact", () => {
    expect(HANDLED_COPY.waiting).toBe("en attente d'un onglet Naka");
    expect(HANDLED_COPY.cancel).toBe("Annuler");
  });

  it("a malformed waiting list hides the section", () => {
    expect(
      toHandledView({ titles: [{ key: "movie:1", label: "A" }], waiting: {} }),
    ).toEqual({ kind: "none" });
    expect(
      toHandledView({
        titles: [{ key: "movie:1", label: "A" }],
        waiting: [{ key: "x", label: "B" }],
      }),
    ).toEqual({ kind: "none" });
  });

  it("keeps remote text as it is, markup included", () => {
    const label = "<img src=x onerror=alert(1)>";
    const view = toHandledView({ titles: [{ key: "movie:1", label }] });
    expect(view).toMatchObject({ items: [{ label }] });
  });

  it("drops every other key of the answer and of an item", () => {
    const view = toHandledView({
      titles: [{ key: "movie:1", label: "A", extra: 1 }],
      token: "x",
    });
    expect(view).toEqual({
      kind: "list",
      heading: "Titres traités (1)",
      items: [{ key: "movie:1", label: "A" }],
      waiting: [],
    });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["text", "x"],
    ["a list", []],
    ["no titles", {}],
    ["titles not a list", { titles: {} }],
    ["an item that is not an object", { titles: ["movie:1"] }],
    ["a key that is not a content key", { titles: [{ key: "x", label: "A" }] }],
    ["a label that is not text", { titles: [{ key: "movie:1", label: 3 }] }],
    ["a missing label", { titles: [{ key: "movie:1" }] }],
    [
      "one bad item among good ones",
      { titles: [{ key: "movie:1", label: "A" }, { key: "movie:2" }] },
    ],
  ])("%s hides the section", (_name, raw) => {
    expect(toHandledView(raw)).toEqual({ kind: "none" });
  });

  it("a hostile getter hides the section instead of throwing", () => {
    const raw = {
      get titles(): unknown {
        throw new Error("boom");
      },
    };
    expect(toHandledView(raw)).toEqual({ kind: "none" });
  });
});
