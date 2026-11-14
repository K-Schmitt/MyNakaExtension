import { describe, expect, it } from "vitest";
import type { FicheView } from "../src/content/fiche-view";
import { createFicheActions } from "../src/content/ui/fiche-actions";
import {
  PROTECTED_LINE,
  partialUndoLine,
  REFUSED_LINES,
  REMOVING_LINE,
  UNDO_FAILED_LINES,
  UNDOING_LINE,
} from "../src/content/ui/fiche-copy";
import type { FicheHandlers } from "../src/content/ui/fiche-handlers";
import type { FicheInfo, FicheProduct } from "../src/ext/fiche-answers";
import {
  FILM_PATH,
  ficheEvent,
  linked,
  SERIES_PATH,
  seasonEvent,
  seriesEvent,
  settle,
} from "./fiche-controller-fakes";
import {
  buttonNamed,
  checked,
  deepParts,
  fakeAside,
  fakeUi,
  idleTimer,
  panelParts,
  starsOf,
  texts,
} from "./fiche-ui-world";
import { FakeDoc, type FakeElement } from "./ui-fakes";

const NB = "\u202F";
const URL = "https://www.senscritique.com/film/solaris/1234";

const productOf = (over: Partial<FicheProduct> = {}): FicheInfo => ({
  state: "linked",
  product: {
    id: 55,
    average: 6.9,
    mine: 7,
    label: { title: "Solaris", year: 1972 },
    canUndo: false,
    canRemove: false,
    protected: false,
    ...over,
  },
});

async function film(info: FicheInfo = linked(55, 7)) {
  const t = fakeUi(FILM_PATH);
  t.controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(info);
  await settle();
  return { ...t, parts: () => panelParts(t.kept) };
}

async function series() {
  const t = fakeUi(SERIES_PATH);
  t.controller.event(seriesEvent());
  t.ofType("fiche-info")[0]?.answer(linked(66, null));
  await settle();
  return { ...t, parts: () => panelParts(t.kept) };
}

/** What the actions host shows, apart from the rows. */
const actionParts = (t: Awaited<ReturnType<typeof film>>) => {
  const host = t.kept.actions();
  return host === undefined ? [] : deepParts(host.shadow);
};

const star = (parts: FakeElement[], value: number) =>
  starsOf(parts).find((s) => s.attributes["aria-label"] === `${value} sur 10`);

const linkOf = (parts: FakeElement[]) => parts.find((p) => p.tag === "a");

describe("the actions under Naka's info panel", () => {
  it("offers « Annuler » while the undo record is live, never « Retirer la note » next to it", async () => {
    const t = await film(productOf({ canUndo: true, canRemove: true }));
    const parts = actionParts(t);
    expect(buttonNamed(parts, "Annuler")).toBeDefined();
    expect(buttonNamed(parts, "Retirer la note")).toBeUndefined();
  });

  it("offers « Retirer la note » without a live record", async () => {
    const t = await film(productOf({ canRemove: true }));
    const parts = actionParts(t);
    expect(buttonNamed(parts, "Retirer la note")).toBeDefined();
    expect(buttonNamed(parts, "Annuler")).toBeUndefined();
  });

  it("shows the protected line instead of « Retirer la note » for a protected title", async () => {
    const t = await film(productOf({ mine: 7, protected: true }));
    const parts = actionParts(t);
    expect(buttonNamed(parts, "Retirer la note")).toBeUndefined();
    expect(texts(parts)).toContain(
      `Une critique ou une recommandation y est liée${NB}: retire la note sur SensCritique.`,
    );
  });

  it("shows no protected line for a rated title the worker says is not protected", async () => {
    const t = await film(productOf({ mine: 7 }));
    expect(texts(actionParts(t))).not.toContain(PROTECTED_LINE);
  });

  it("shows no protected line while « Annuler » is offered", async () => {
    const t = await film(productOf({ canUndo: true, protected: true }));
    expect(texts(actionParts(t))).not.toContain(PROTECTED_LINE);
    expect(buttonNamed(actionParts(t), "Annuler")).toBeDefined();
  });

  it("shows no protected line after a rating whose before-state read failed (no flags kept)", async () => {
    const t = await film();
    star(t.parts(), 8)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({
      ok: true,
      panel: { canUndo: false, canRemove: false, protected: false },
    });
    await settle();
    expect(checked(t.parts())).toEqual(["8 sur 10"]);
    expect(texts(actionParts(t))).not.toContain(PROTECTED_LINE);
  });

  it.each([
    ["an undo", "undo", { canUndo: true }, "Annuler"],
    ["a removal", "remove", { canRemove: true }, "Retirer la note"],
  ] as const)(
    "disables the buttons while %s is on its way",
    async (_n, action, flags, label) => {
      const t = await film(productOf({ ...flags, url: URL }));
      expect(
        buttonNamed(actionParts(t), label)?.attributes.disabled,
      ).toBeUndefined();
      if (action === "undo") t.controller.undo();
      else t.controller.remove();
      const pressed = buttonNamed(actionParts(t), label);
      expect(pressed?.attributes).toMatchObject({
        disabled: "",
        "aria-disabled": "true",
      });
    },
  );

  it("disables « Retirer la note » while a rating is on its way", async () => {
    const t = await film(productOf({ canRemove: true }));
    t.controller.rateTitle(8);
    expect(
      buttonNamed(actionParts(t), "Retirer la note")?.attributes[
        "aria-disabled"
      ],
    ).toBe("true");
  });

  it("offers neither « Annuler » nor « Retirer la note » when the info is not read again after an undo", async () => {
    const t = await film(productOf({ canUndo: true, canRemove: true }));
    t.controller.undo();
    t.ofType("fiche-undo")[0]?.answer({ ok: true, maListe: "none" });
    await settle();
    t.ofType("fiche-info")[1]?.answer(undefined);
    await settle();
    const parts = actionParts(t);
    expect(buttonNamed(parts, "Annuler")).toBeUndefined();
    expect(buttonNamed(parts, "Retirer la note")).toBeUndefined();
    expect(texts(parts)).not.toContain(UNDOING_LINE);
    expect(texts(parts)).not.toContain(PROTECTED_LINE);
  });

  it("shows neither button nor protected line for a title not rated", async () => {
    const t = await film(productOf({ mine: null }));
    expect(texts(actionParts(t))).toEqual([]);
  });

  it("links to the product's page in a new tab, with no opener", async () => {
    const t = await film(productOf({ url: URL }));
    const link = linkOf(actionParts(t));
    expect(link?.textContent).toBe("Voir sur SensCritique");
    expect(link?.attributes).toMatchObject({
      href: URL,
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("gives no link without a url", async () => {
    const t = await film(productOf({ canRemove: true }));
    expect(linkOf(actionParts(t))).toBeUndefined();
  });

  it("sends nothing on an untrusted « Annuler » or « Retirer la note »", async () => {
    const t = await film(productOf({ canUndo: true }));
    buttonNamed(actionParts(t), "Annuler")?.click(false);
    const u = await film(productOf({ canRemove: true }));
    buttonNamed(actionParts(u), "Retirer la note")?.click(false);
    expect(t.ofType("fiche-undo")).toEqual([]);
    expect(u.ofType("fiche-remove")).toEqual([]);
  });

  it("sends fiche-undo on a trusted « Annuler », once for a double click", async () => {
    const t = await film(productOf({ canUndo: true }));
    buttonNamed(actionParts(t), "Annuler")?.click(true);
    expect(texts(actionParts(t))).toContain(UNDOING_LINE);
    buttonNamed(actionParts(t), "Annuler")?.click(true);
    t.controller.undo();
    expect(t.ofType("fiche-undo").map((c) => c.msg)).toEqual([
      { type: "fiche-undo", contentId: 5, productId: 55 },
    ]);
  });

  it("asks the info again after an undo, and shows what it says", async () => {
    const t = await film(productOf({ canUndo: true, mine: 8 }));
    buttonNamed(actionParts(t), "Annuler")?.click(true);
    t.ofType("fiche-undo")[0]?.answer({ ok: true, maListe: "none" });
    await settle();
    expect(t.ofType("fiche-info")).toHaveLength(2);
    expect(texts(actionParts(t))).toContain(UNDOING_LINE);
    t.ofType("fiche-info")[1]?.answer(productOf({ mine: 6, canRemove: true }));
    await settle();
    expect(checked(t.parts())).toEqual(["6 sur 10"]);
    expect(buttonNamed(actionParts(t), "Retirer la note")).toBeDefined();
    expect(texts(actionParts(t))).not.toContain(UNDOING_LINE);
  });

  it("sends fiche-remove on a trusted « Retirer la note », once, then asks the info again", async () => {
    const t = await film(productOf({ canRemove: true }));
    buttonNamed(actionParts(t), "Retirer la note")?.click(true);
    expect(texts(actionParts(t))).toContain(REMOVING_LINE);
    t.controller.remove();
    expect(t.ofType("fiche-remove").map((c) => c.msg)).toEqual([
      { type: "fiche-remove", contentId: 5, productId: 55 },
    ]);
    t.ofType("fiche-remove")[0]?.answer({ ok: true });
    await settle();
    t.ofType("fiche-info")[1]?.answer(productOf({ mine: null }));
    await settle();
    expect(checked(t.parts())).toEqual([]);
    expect(texts(actionParts(t))).toEqual([]);
  });

  it.each([
    ["a lost undo", "undo", undefined, UNDO_FAILED_LINES.undo],
    [
      "an undo not sent",
      "undo",
      { error: "sc-session" },
      UNDO_FAILED_LINES.undo,
    ],
    ["an expired undo", "undo", { refused: "expired" }, REFUSED_LINES.expired],
    ["a lost removal", "remove", undefined, UNDO_FAILED_LINES.remove],
    [
      "an unrated removal",
      "remove",
      { refused: "unrated" },
      REFUSED_LINES.unrated,
    ],
    ["a protected removal", "remove", { refused: "protected" }, PROTECTED_LINE],
    [
      "a partial undo",
      "undo",
      {
        partial: { done: [{ kind: "undone" }], failed: { kind: "wish" } },
        maListe: "none",
        error: "sc-session",
      },
      partialUndoLine("wish"),
    ],
  ] as const)("%s shows its line once", async (_n, action, answer, line) => {
    const t = await film(productOf({ canUndo: true, canRemove: true }));
    if (action === "undo") t.controller.undo();
    else t.controller.remove();
    t.ofType(action === "undo" ? "fiche-undo" : "fiche-remove")[0]?.answer(
      answer,
    );
    await settle();
    t.ofType("fiche-info")[1]?.answer(productOf({ mine: 7 }));
    await settle();
    expect(texts(actionParts(t)).filter((s) => s === line)).toEqual([line]);
  });
});

describe("the undo and refusal copy", () => {
  const codePoints = (s: string) => [...s].map((c) => c.codePointAt(0));

  it("puts U+202F before « : » in the protected line", () => {
    const at = PROTECTED_LINE.indexOf(":");
    expect(codePoints(PROTECTED_LINE)[at - 1]).toBe(0x202f);
  });

  it("says what a partial undo did not put back, for every step", () => {
    expect(partialUndoLine("wish")).toBe(
      `L’annulation s’est arrêtée${NB}: le titre n’est pas revenu dans tes envies, et la suite n’a pas été faite.`,
    );
    expect(partialUndoLine("markDone")).toBe(
      `L’annulation s’est arrêtée${NB}: le «${NB}vu${NB}» et sa date ne sont pas revenus, et la suite n’a pas été faite.`,
    );
    expect(partialUndoLine("maListe")).toContain(
      "le film n’est pas revenu dans Ma liste",
    );
  });

  it("writes every new line in « tu », with ’ and no ASCII apostrophe", () => {
    const lines = [
      PROTECTED_LINE,
      UNDOING_LINE,
      REMOVING_LINE,
      ...Object.values(UNDO_FAILED_LINES),
      ...Object.values(REFUSED_LINES),
      ...(
        [
          "rate",
          "markDone",
          "markDoneWithoutDate",
          "undone",
          "wish",
          "maListe",
          "localRestore",
        ] as const
      ).map(partialUndoLine),
    ];
    for (const line of lines) {
      expect(codePoints(line)).not.toContain(0x27);
      expect(line).not.toMatch(/\b(vous|votre|vos)\b|ez\b/i);
      expect(line).not.toMatch(/ [:;?!]/);
    }
  });
});

describe("every step 7 rare state, in the actions host", () => {
  it("shows a loading line until the worker answers", () => {
    const t = fakeUi(FILM_PATH);
    t.controller.event(ficheEvent());
    const host = t.kept.actions() as FakeElement;
    expect(texts(deepParts(host.shadow))).toEqual([
      "Recherche sur SensCritique\u2026",
    ]);
  });

  it("says when SensCritique could not be read", async () => {
    const t = fakeUi(FILM_PATH);
    t.controller.event(ficheEvent());
    t.ofType("fiche-info")[0]?.answer(undefined);
    await settle();
    const host = t.kept.actions() as FakeElement;
    expect(texts(deepParts(host.shadow))).toEqual([
      "SensCritique n’a pas pu être lu.",
    ]);
  });

  it("says a title is not on SensCritique", async () => {
    const t = await film({ state: "notfound" });
    expect(texts(actionParts(t))).toEqual(["Pas trouvé sur SensCritique"]);
  });

  it("offers the candidates with their posters; a trusted choice sends fiche-link, then shows the rows", async () => {
    const t = await film({
      state: "choose",
      candidates: [
        {
          id: 70,
          title: "Solaris",
          year: 1972,
          type: "film",
          image: { posterPath: "/sol.jpg" },
        },
        { id: 71, title: "Solaris", year: 2002, type: "film" },
      ],
    });
    const parts = actionParts(t);
    expect(texts(parts)).toContain("Relier à SensCritique");
    const choices = parts.filter((p) =>
      p.className.split(" ").includes("mn-choice"),
    );
    expect(choices.map((c) => texts(c.children as FakeElement[]))).toEqual([
      ["Solaris (1972, film)"],
      ["Solaris (2002, film)"],
    ]);
    expect(parts.find((p) => p.tag === "img")?.attributes.src).toBe(
      "https://image.tmdb.org/t/p/w92/sol.jpg",
    );
    choices[1]?.click(false);
    expect(t.ofType("fiche-link")).toEqual([]);
    choices[1]?.click(true);
    expect(t.ofType("fiche-link").map((c) => c.msg)).toEqual([
      { type: "fiche-link", contentId: 5, productId: 71 },
    ]);
    t.ofType("fiche-link")[0]?.answer({ ok: true });
    await settle();
    t.ofType("fiche-info")[1]?.answer(linked(71, null));
    await settle();
    expect(texts(t.parts())).toContain("6,9 / 10");
    expect(starsOf(t.parts())).toHaveLength(10);
  });

  it("replaces the actions with a series' confirmation: its « Annuler » cancels and sends nothing", async () => {
    const t = await series();
    star(t.parts(), 6)?.click(true);
    const parts = actionParts(t);
    expect(texts(parts)).toContain(
      "SensCritique va retirer la série de tes envies.",
    );
    expect(parts.filter((p) => p.tag === "button")).toHaveLength(2);
    buttonNamed(parts, "Annuler")?.click(true);
    expect(t.ofType("fiche-rate")).toEqual([]);
    expect(t.ofType("fiche-undo")).toEqual([]);
    expect(texts(actionParts(t))).not.toContain(
      "SensCritique va retirer la série de tes envies.",
    );
  });

  it("hides « Annuler » (undo) while a series' confirmation is shown", async () => {
    const t = fakeUi(SERIES_PATH);
    t.controller.event(seriesEvent());
    t.ofType("fiche-info")[0]?.answer(productOf({ id: 66, canUndo: true }));
    await settle();
    const parts = () => deepParts(t.kept.actions()?.shadow ?? t.kept.aside);
    expect(buttonNamed(parts(), "Annuler")).toBeDefined();
    t.controller.rateTitle(6);
    expect(parts().filter((p) => p.textContent === "Annuler")).toHaveLength(1);
    expect(buttonNamed(parts(), "Envoyer")).toBeDefined();
  });

  it("sends a series' rating on « Envoyer », a trusted click only", async () => {
    const t = await series();
    star(t.parts(), 6)?.click(true);
    buttonNamed(t.parts(), "Envoyer")?.click(false);
    expect(t.ofType("fiche-rate")).toEqual([]);
    buttonNamed(t.parts(), "Envoyer")?.click(true);
    expect(t.ofType("fiche-rate").map((c) => c.msg)).toEqual([
      {
        type: "fiche-rate",
        contentId: 6,
        target: "série",
        productId: 66,
        rating: 6,
      },
    ]);
  });

  it("shows the rating on its way, then the stars with it", async () => {
    const t = await film();
    star(t.parts(), 8)?.click(true);
    expect(texts(t.parts())).toContain("Envoi de la note\u2026");
    t.ofType("fiche-rate")[0]?.answer({ ok: true });
    await settle();
    expect(checked(t.parts())).toEqual(["8 sur 10"]);
  });

  it("takes the rating's panel flags: « Annuler » shows once the rating went out", async () => {
    const t = await film();
    star(t.parts(), 8)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({
      ok: true,
      panel: { canUndo: true, canRemove: true, protected: false, url: URL },
    });
    await settle();
    expect(buttonNamed(actionParts(t), "Annuler")).toBeDefined();
    expect(linkOf(actionParts(t))?.attributes.href).toBe(URL);
  });

  it("says « Note envoyée, mais … » when a later step failed", async () => {
    const t = await film();
    star(t.parts(), 9)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({ sent: true, error: "naka-session" });
    await settle();
    expect(texts(t.parts())).toContain(
      `Note envoyée, mais le retrait de Ma liste n’a pas abouti${NB}: reconnectez-vous sur Naka.`,
    );
    expect(checked(t.parts())).toEqual(["9 sur 10"]);
  });

  it("shows the error lines of a rating that did not go out", async () => {
    const t = await film();
    star(t.parts(), 9)?.click(true);
    t.ofType("fiche-rate")[0]?.answer({ error: "finish-limit" });
    await settle();
    expect(texts(t.parts())).toContain(
      `La note n'est pas partie${NB}: trop de fins de visionnage en une heure, réessayez plus tard.`,
    );
    t.controller.rateTitle(4);
    t.ofType("fiche-rate")[1]?.answer(undefined);
    await settle();
    expect(texts(t.parts())).toContain(
      `La note n'est pas partie${NB}: ce titre n'a pas pu être noté.`,
    );
  });

  it("shows a line for the shown season whose read failed", async () => {
    const t = fakeUi(SERIES_PATH);
    t.page.shown = 2;
    t.controller.event(seriesEvent());
    t.controller.event(seasonEvent(2));
    t.ofType("fiche-info")[0]?.answer(linked(66));
    await settle();
    t.ofType("fiche-season")[0]?.answer(undefined);
    await settle();
    expect(texts(panelParts(t.kept))).toContain(
      "Les notes de la saison 2 n’ont pas pu être lues.",
    );
    expect(starsOf(panelParts(t.kept))).toHaveLength(10);
  });
});

describe("the actions between two views", () => {
  const noop = () => {};
  const handlers: FicheHandlers = {
    rateTitle: noop,
    confirmSeries: noop,
    cancelSeries: noop,
    rateEpisode: noop,
    link: noop,
    undo: noop,
    remove: noop,
  };
  const filmView = (mine: number | null, episodes = 0): FicheView => ({
    mediaType: "movie",
    info: productOf({ mine, canRemove: mine !== null }),
    episodes: new Map(
      Array.from({ length: episodes }, (_, i) => [
        i + 1,
        { productId: 100 + i, average: 7 },
      ]),
    ),
  });

  function actions() {
    const doc = new FakeDoc();
    const aside = fakeAside(["Note TMDB"]);
    const shown = createFicheActions({
      doc,
      panel: aside.panel,
      watch: () => () => {},
      timer: idleTimer,
    });
    const built = () =>
      doc.created.filter((el) => el.className === "mn-fiche-actions").length;
    return { shown, built };
  }

  it("builds them once for two equal views, whatever the episodes", () => {
    const t = actions();
    t.shown.show(filmView(7), handlers);
    t.shown.show(filmView(7, 3), handlers);
    expect(t.built()).toBe(1);
  });

  it("builds them again when the view or the handlers change, or after a take-down", () => {
    const t = actions();
    t.shown.show(filmView(7), handlers);
    t.shown.show({ ...filmView(7), pending: "undo" }, handlers);
    t.shown.show({ ...filmView(7), pending: "undo" }, { ...handlers });
    t.shown.hide();
    t.shown.show({ ...filmView(7), pending: "undo" }, { ...handlers });
    expect(t.built()).toBe(4);
  });

  it("builds them again when a write starts, ends or fails", () => {
    const t = actions();
    t.shown.show(filmView(7), handlers);
    t.shown.show({ ...filmView(7), pending: "rating" }, handlers);
    t.shown.show(filmView(8), handlers);
    t.shown.show(
      { ...filmView(8), outcome: { kind: "not-sent", error: "sc-session" } },
      handlers,
    );
    expect(t.built()).toBe(4);
  });

  it("builds them again for a season line, and when the season changes, its line staying", () => {
    const t = actions();
    t.shown.show(filmView(7), handlers);
    t.shown.show({ ...filmView(7), season: 2, seasonFailed: true }, handlers);
    t.shown.show({ ...filmView(7), season: 3, seasonFailed: true }, handlers);
    expect(t.built()).toBe(3);
  });

  it("compares a field of the view it does not name yet", () => {
    const t = actions();
    t.shown.show(filmView(7), handlers);
    const later = { ...filmView(7), later: "drawn" } as FicheView;
    t.shown.show(later, handlers);
    expect(t.built()).toBe(2);
  });
});
