import { describe, expect, it } from "vitest";
import type { FicheInfo } from "../src/ext/fiche-answers";
import {
  FILM_PATH,
  ficheEvent,
  linked,
  SERIES_PATH,
  settle,
} from "./fiche-controller-fakes";
import {
  buttonNamed,
  deepParts,
  fakeUi,
  starsOf,
  texts,
} from "./fiche-ui-world";
import { FakeElement } from "./ui-fakes";

const NB = "\u202F";
const NOT_FOUND: FicheInfo = { state: "notfound" };
const RESULTS = {
  candidates: [
    {
      id: 80,
      title: "Solyaris",
      year: 1972,
      type: "film",
      image: { posterPath: "/soly.jpg" },
    },
    { id: 81, title: "Solaris", year: 1968, type: "film" },
  ],
};

type Field = FakeElement & { value: string };

async function notFound(path = FILM_PATH, info: FicheInfo = NOT_FOUND) {
  const t = fakeUi(path);
  t.controller.event(
    path === FILM_PATH
      ? ficheEvent()
      : ficheEvent({ contentId: 6, tmdbId: 9006, mediaType: "tv" }),
  );
  t.ofType("fiche-info")[0]?.answer(info);
  await settle();
  const parts = () => {
    const host = t.kept.actions();
    return host === undefined ? [] : deepParts(host.shadow);
  };
  const field = () => parts().find((p) => p.tag === "input") as Field;
  const chercher = () => buttonNamed(parts(), "Chercher");
  const choices = () =>
    parts().filter((p) => p.className.split(" ").includes("mn-choice"));
  return { ...t, parts, field, chercher, choices };
}

async function infoFailed() {
  const t = fakeUi(FILM_PATH);
  t.controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(undefined);
  await settle();
  const parts = () => deepParts(t.kept.actions()?.shadow ?? t.kept.aside);
  return { ...t, parts, retry: () => buttonNamed(parts(), "Réessayer") };
}

const codePoints = (s: string) => [...s].map((c) => c.codePointAt(0));

describe("« Chercher » under « Pas trouvé sur SensCritique »", () => {
  it("offers a field pre-filled with Naka's title, its placeholder and « Chercher »", async () => {
    const t = await notFound();
    expect(texts(t.parts())).toContain("Pas trouvé sur SensCritique");
    expect(t.field().value).toBe("Solaris");
    expect(t.field().attributes.placeholder).toBe("Titre sur SensCritique");
    expect(t.chercher()).toBeDefined();
  });

  it("offers no field on a title SensCritique found or whose candidates are shown", async () => {
    const t = await notFound(FILM_PATH, linked(55, 7));
    expect(t.field()).toBeUndefined();
    const c = await notFound(FILM_PATH, { state: "choose", candidates: [] });
    expect(c.field()).toBeUndefined();
  });

  it("sends one fiche-search with the trimmed query on a trusted click, none on an untrusted one", async () => {
    const t = await notFound();
    t.field().value = "  Solyaris  ";
    t.chercher()?.click(false);
    expect(t.ofType("fiche-search")).toEqual([]);
    t.chercher()?.click(true);
    expect(t.ofType("fiche-search").map((c) => c.msg)).toEqual([
      { type: "fiche-search", contentId: 5, query: "Solyaris" },
    ]);
  });

  it("sends nothing for an empty query or one past 100 characters", async () => {
    const t = await notFound();
    t.field().value = "   ";
    t.chercher()?.click(true);
    t.field().value = "a".repeat(101);
    t.chercher()?.click(true);
    expect(t.ofType("fiche-search")).toEqual([]);
    t.field().value = "a".repeat(100);
    t.chercher()?.click(true);
    expect(t.ofType("fiche-search")).toHaveLength(1);
  });

  it("sends nothing for a query with a lone surrogate, but sends a well-formed emoji", async () => {
    const t = await notFound();
    t.field().value = "Sol\uD800aris";
    t.chercher()?.click(true);
    expect(t.ofType("fiche-search")).toEqual([]);
    t.field().value = "Solaris \u{1F3AC}";
    t.chercher()?.click(true);
    expect(t.ofType("fiche-search")).toHaveLength(1);
  });

  it("sends it on a trusted Enter in the field, never on an untrusted one", async () => {
    const t = await notFound();
    t.field().value = "Solyaris";
    t.field().dispatch("keydown", false, "Enter");
    expect(t.ofType("fiche-search")).toEqual([]);
    expect(t.field().press("Enter")).toBe(true);
    expect(t.ofType("fiche-search").map((c) => c.msg)).toEqual([
      { type: "fiche-search", contentId: 5, query: "Solyaris" },
    ]);
  });

  it("sends nothing on another key", async () => {
    const t = await notFound();
    t.field().press("a");
    expect(t.ofType("fiche-search")).toEqual([]);
  });

  it("sends no search on a title SensCritique found, nor on a « choose » page", async () => {
    const found = await notFound(FILM_PATH, linked(55, 7));
    found.controller.search("Solyaris");
    expect(found.ofType("fiche-search")).toEqual([]);
    const choose = await notFound(FILM_PATH, {
      state: "choose",
      candidates: [{ id: 80, title: "Solyaris", year: 1972, type: "film" }],
    });
    choose.controller.search("Solyaris");
    expect(choose.ofType("fiche-search")).toEqual([]);
  });

  it("sends no search while a link is on its way", async () => {
    const t = await notFound();
    t.chercher()?.click(true);
    t.ofType("fiche-search")[0]?.answer(RESULTS);
    await settle();
    t.choices()[0]?.click(true);
    expect(t.ofType("fiche-link")).toHaveLength(1);
    t.controller.search("Solyaris");
    t.chercher()?.click(true);
    expect(t.ofType("fiche-search")).toHaveLength(1);
  });

  it("pre-fills the field with Naka's original title when the page gave no title", async () => {
    const t = fakeUi(FILM_PATH);
    t.controller.event(
      ficheEvent({ title: undefined, originalTitle: "Solyaris" }),
    );
    t.ofType("fiche-info")[0]?.answer(NOT_FOUND);
    await settle();
    const host = t.kept.actions();
    const parts = host === undefined ? [] : deepParts(host.shadow);
    const field = parts.find((p) => p.tag === "input") as Field | undefined;
    expect(field?.value).toBe("Solyaris");
  });

  it("sends no second search while one is pending (R1)", async () => {
    const t = await notFound();
    const field = t.field();
    const chercher = t.chercher();
    chercher?.click(true);
    chercher?.click(true);
    field.press("Enter");
    t.controller.search("Autre");
    expect(t.ofType("fiche-search")).toHaveLength(1);
  });

  it("shows a searching line, keeping the searched words in the field", async () => {
    const t = await notFound();
    t.field().value = "Solyaris";
    t.chercher()?.click(true);
    expect(texts(t.parts())).toContain("Recherche en cours\u2026");
    expect(t.field().value).toBe("Solyaris");
  });

  it("shows the results with their posters; a trusted click on one sends fiche-link, then fills the panel", async () => {
    const t = await notFound();
    t.chercher()?.click(true);
    t.ofType("fiche-search")[0]?.answer(RESULTS);
    await settle();
    expect(t.choices().map((c) => texts(c.children as FakeElement[]))).toEqual([
      ["Solyaris (1972, film)"],
      ["Solaris (1968, film)"],
    ]);
    expect(t.parts().find((p) => p.tag === "img")?.attributes.src).toBe(
      "https://image.tmdb.org/t/p/w92/soly.jpg",
    );
    t.choices()[0]?.click(false);
    expect(t.ofType("fiche-link")).toEqual([]);
    t.choices()[0]?.click(true);
    expect(t.ofType("fiche-link").map((c) => c.msg)).toEqual([
      { type: "fiche-link", contentId: 5, productId: 80 },
    ]);
    expect(texts(t.parts())).toContain("Liaison en cours\u2026");
    t.ofType("fiche-link")[0]?.answer({ ok: true });
    await settle();
    t.ofType("fiche-info")[1]?.answer(linked(80, null));
    await settle();
    expect(starsOf(deepParts(t.kept.aside))).toHaveLength(10);
    expect(t.field()).toBeUndefined();
  });

  it("links no result the search did not give", async () => {
    const t = await notFound();
    t.chercher()?.click(true);
    t.ofType("fiche-search")[0]?.answer(RESULTS);
    await settle();
    t.controller.link(99);
    expect(t.ofType("fiche-link")).toEqual([]);
  });

  it("drops the older results while a new search is on its way", async () => {
    const t = await notFound();
    t.chercher()?.click(true);
    t.ofType("fiche-search")[0]?.answer(RESULTS);
    await settle();
    const old = t.choices()[0];
    t.chercher()?.click(true);
    expect(t.choices()).toEqual([]);
    old?.click(true);
    expect(t.ofType("fiche-link")).toEqual([]);
  });

  it("renders nothing for an answer that arrives after the page changed", async () => {
    const t = await notFound();
    t.chercher()?.click(true);
    t.controller.path(SERIES_PATH);
    const views = t.views.length;
    t.ofType("fiche-search")[0]?.answer(RESULTS);
    await settle();
    expect(t.views.length).toBe(views);
  });

  it("a link from the results answered after the page changed: no info asked again, nothing rendered", async () => {
    // Arrange
    const t = await notFound();
    t.chercher()?.click(true);
    t.ofType("fiche-search")[0]?.answer(RESULTS);
    await settle();
    t.choices()[0]?.click(true);
    t.controller.path(SERIES_PATH);
    const views = t.views.length;

    // Act
    t.ofType("fiche-link")[0]?.answer({ ok: true });
    await settle();

    // Assert
    expect(t.ofType("fiche-info")).toHaveLength(1);
    expect(t.views.length).toBe(views);
  });

  it("says « Rien trouvé pour « {query} » » with U+202F inside the quotes", async () => {
    const t = await notFound();
    t.field().value = " Solyaris ";
    t.chercher()?.click(true);
    t.ofType("fiche-search")[0]?.answer({ candidates: [] });
    await settle();
    const line = texts(t.parts()).find((s) => s.startsWith("Rien trouvé"));
    expect(codePoints(line ?? "")).toEqual(
      codePoints(`Rien trouvé pour «${NB}Solyaris${NB}»`),
    );
    expect(t.field().value).toBe("Solyaris");
  });

  it("says SensCritique could not be read when the search gets no answer, and searches again", async () => {
    const t = await notFound();
    t.chercher()?.click(true);
    t.ofType("fiche-search")[0]?.answer(undefined);
    await settle();
    expect(texts(t.parts())).toContain("SensCritique n’a pas pu être lu.");
    t.chercher()?.click(true);
    expect(t.ofType("fiche-search")).toHaveLength(2);
  });

  it("keeps the field's keys and input from Naka's page", async () => {
    const t = await notFound();
    const seen: string[] = [];
    const types = ["keydown", "keyup", "keypress", "beforeinput", "input"];
    for (const type of types) {
      t.kept.aside.addEventListener(type, () => seen.push(type));
    }
    t.field().press("s");
    t.field().press("Enter");
    for (const type of ["keyup", "keypress", "beforeinput", "input"]) {
      t.field().dispatch(type, true, "s");
    }
    expect(seen).toEqual([]);
  });

  it("searches a series' title too", async () => {
    const t = await notFound(SERIES_PATH);
    t.chercher()?.click(true);
    expect(t.ofType("fiche-search").map((c) => c.msg)).toEqual([
      { type: "fiche-search", contentId: 6, query: "Solaris" },
    ]);
  });
});

describe("« Réessayer » under « SensCritique n’a pas pu être lu »", () => {
  it("offers « Réessayer » under the line", async () => {
    const t = await infoFailed();
    expect(texts(t.parts())).toEqual([
      "SensCritique n’a pas pu être lu.",
      "Réessayer",
    ]);
  });

  it("sends the visit's fiche-info again on a trusted click, none on an untrusted one", async () => {
    const t = await infoFailed();
    t.retry()?.click(false);
    expect(t.ofType("fiche-info")).toHaveLength(1);
    t.retry()?.click(true);
    const infos = t.ofType("fiche-info").map((c) => c.msg);
    expect(infos).toHaveLength(2);
    expect(infos[1]).toEqual(infos[0]);
  });

  it("sends one fiche-info for a double click", async () => {
    const t = await infoFailed();
    const retry = t.retry();
    retry?.click(true);
    retry?.click(true);
    t.controller.retry();
    expect(t.ofType("fiche-info")).toHaveLength(2);
  });

  it("shows the loading line while the read is on its way, then fills the panel with its answer", async () => {
    const t = await infoFailed();
    t.retry()?.click(true);
    expect(texts(t.parts())).toEqual(["Recherche sur SensCritique\u2026"]);
    t.ofType("fiche-info")[1]?.answer(linked(55, 7));
    await settle();
    expect(texts(deepParts(t.kept.aside))).toContain("6,9 / 10");
    expect(t.retry()).toBeUndefined();
  });

  it("offers « Réessayer » again when the new read fails too", async () => {
    const t = await infoFailed();
    t.retry()?.click(true);
    t.ofType("fiche-info")[1]?.answer(undefined);
    await settle();
    t.retry()?.click(true);
    expect(t.ofType("fiche-info")).toHaveLength(3);
  });

  it("sends nothing before the first read ended", () => {
    const t = fakeUi(FILM_PATH);
    t.controller.event(ficheEvent());
    t.controller.retry();
    expect(t.ofType("fiche-info")).toHaveLength(1);
  });
});

describe("the search field across a redraw", () => {
  it("is read-only while a search is pending, and writable again with its answer", async () => {
    const t = await notFound();
    expect(t.field().attributes.readonly).toBeUndefined();
    t.chercher()?.click(true);
    expect(t.field().attributes.readonly).toBe("");
    t.ofType("fiche-search")[0]?.answer(RESULTS);
    await settle();
    expect(t.field().attributes.readonly).toBeUndefined();
  });

  it("gives the focus back to the new field, caret at the end, when the field had it", async () => {
    const t = await notFound();
    const typed = t.field();
    typed.focus();
    typed.value = "Solyaris";
    typed.press("Enter");
    const searching = t.field();
    expect(searching).not.toBe(typed);
    expect(FakeElement.focused).toBe(searching);
    expect(searching.selection).toEqual([8, 8]);
    t.ofType("fiche-search")[0]?.answer(RESULTS);
    await settle();
    expect(FakeElement.focused).toBe(t.field());
    expect(t.field().selection).toEqual([8, 8]);
  });

  it("leaves the focus alone when the field did not have it", async () => {
    const t = await notFound();
    t.chercher()?.click(true);
    expect(t.field().focusCount).toBe(0);
  });
});

describe("the search field's pre-fill", () => {
  async function prefilled(title: string) {
    const t = fakeUi(FILM_PATH);
    t.controller.event(ficheEvent({ title }));
    t.ofType("fiche-info")[0]?.answer(NOT_FOUND);
    await settle();
    const host = t.kept.actions();
    const parts = host === undefined ? [] : deepParts(host.shadow);
    return (parts.find((p) => p.tag === "input") as Field).value;
  }

  it("clips Naka's title to 100 characters", async () => {
    expect(await prefilled("a".repeat(150))).toBe("a".repeat(100));
  });

  it("never cuts a surrogate pair in two", async () => {
    const title = `${"a".repeat(99)}\u{1F3AC}b`;
    expect(await prefilled(title)).toBe("a".repeat(99));
  });
});
