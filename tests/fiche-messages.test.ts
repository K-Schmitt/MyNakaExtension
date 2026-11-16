import { describe, expect, it } from "vitest";
import {
  parseFicheInfo,
  parseLinkAnswer,
  parseMineAnswer,
  parseRateAnswer,
  parseSearchAnswer,
  parseSeasonAnswer,
} from "../src/ext/fiche-answers";
import { allowedFor, parseToWorker } from "../src/ext/messages";

const INFO = {
  type: "fiche-info",
  contentId: 5,
  tmdbId: 1434,
  mediaType: "tv",
  title: "Les Griffin",
  originalTitle: "Family Guy",
  year: 1999,
};
const SEASON = { type: "fiche-season", contentId: 5, season: 2 };
const MINE = { type: "fiche-mine", contentId: 5, productId: 77 };
const LINK = { type: "fiche-link", contentId: 5, productId: 77 };
const UNDO = { type: "fiche-undo", contentId: 5, productId: 77 };
const REMOVE = { type: "fiche-remove", contentId: 5, productId: 77 };
const SEARCH = { type: "fiche-search", contentId: 5, query: "Solaris" };
const FILM = {
  type: "fiche-rate",
  contentId: 5,
  target: "film",
  productId: 77,
  rating: 8,
};
const EPISODE = { ...FILM, target: "épisode", season: 2, episode: 3 };
const VALID = [
  INFO,
  SEASON,
  MINE,
  LINK,
  FILM,
  { ...FILM, target: "série" },
  EPISODE,
  { ...FILM, inMaListe: true },
  { ...FILM, inMaListe: false },
  { ...FILM, inMaListe: true, listByTab: true },
  { ...FILM, listByTab: false },
  UNDO,
  { ...UNDO, listByTab: true },
  { ...UNDO, listByTab: false },
  REMOVE,
  SEARCH,
  { ...SEARCH, query: "x".repeat(100) },
  { ...SEARCH, query: "Solaris \u{1F3AC}" },
];

describe("title page messages", () => {
  it("parses each valid message to itself", () => {
    for (const msg of VALID) expect(parseToWorker(msg)).toEqual(msg);
    const bare = { ...INFO, originalTitle: undefined, year: undefined };
    expect(parseToWorker(bare)).toEqual({
      type: "fiche-info",
      contentId: 5,
      tmdbId: 1434,
      mediaType: "tv",
      title: "Les Griffin",
    });
  });

  it("parses an info without a title (the page's was unreadable; the worker reads Naka's)", () => {
    const { title: _t, ...untitled } = INFO;
    expect(parseToWorker(untitled)).toEqual(untitled);
  });

  it.each([
    ["rating 0", { ...FILM, rating: 0 }],
    ["rating 11", { ...FILM, rating: 11 }],
    ["rating 7.5", { ...FILM, rating: 7.5 }],
    ["fractional product id", { ...FILM, productId: 1.5 }],
    ["fractional content id", { ...MINE, contentId: 2.5 }],
    ["zero id", { ...LINK, productId: 0 }],
    ["target saison", { ...FILM, target: "saison" }],
    ["épisode without place", { ...FILM, target: "épisode" }],
    ["épisode without episode", { ...EPISODE, episode: undefined }],
    ["épisode without season", { ...EPISODE, season: undefined }],
    ["film with a season", { ...FILM, season: 1 }],
    ["« Ma liste » as text", { ...FILM, inMaListe: "true" }],
    ["« Ma liste » as a number", { ...FILM, inMaListe: 1 }],
    ["« Ma liste » on a series", { ...FILM, target: "série", inMaListe: true }],
    ["« Ma liste » on an episode", { ...EPISODE, inMaListe: false }],
    ["a rating's listByTab as text", { ...FILM, listByTab: "true" }],
    ["listByTab on a series", { ...FILM, target: "série", listByTab: true }],
    ["listByTab on an episode", { ...EPISODE, listByTab: true }],
    ["an extra key on info", { ...INFO, token: "t" }],
    ["an extra key on rate", { ...FILM, tmdbId: 1 }],
    ["an extra key on mine", { ...MINE, x: 1 }],
    ["an extra key on link", { ...LINK, x: 1 }],
    ["an extra key on undo", { ...UNDO, x: 1 }],
    ["an undo without a product", { ...UNDO, productId: undefined }],
    ["listByTab as text", { ...UNDO, listByTab: "true" }],
    ["listByTab on a removal", { ...REMOVE, listByTab: true }],
    ["a removal with a zero content id", { ...REMOVE, contentId: 0 }],
    ["an extra key on season", { ...SEASON, x: 1 }],
    ["a 201 character title", { ...INFO, title: "x".repeat(201) }],
    ["a bad media type", { ...INFO, mediaType: "film" }],
    ["an info without a TMDB id", { ...INFO, tmdbId: undefined }],
    ["a TMDB id of 0", { ...INFO, tmdbId: 0 }],
    ["a text TMDB id", { ...INFO, tmdbId: "1434" }],
    ["season 0", { ...SEASON, season: 0 }],
    ["season 101", { ...SEASON, season: 101 }],
    ["an empty query", { ...SEARCH, query: "" }],
    ["a query of spaces only", { ...SEARCH, query: "   " }],
    ["a 101 character query", { ...SEARCH, query: "x".repeat(101) }],
    ["a query as a number", { ...SEARCH, query: 7 }],
    ["a query with a lone surrogate", { ...SEARCH, query: "Sol\uD800aris" }],
    [
      "a query ending in a lone surrogate",
      { ...SEARCH, query: "Solaris\uD83C" },
    ],
    ["a search without a query", { ...SEARCH, query: undefined }],
    ["a search without a content", { ...SEARCH, contentId: undefined }],
    ["an extra key on search", { ...SEARCH, universe: "movie" }],
  ])("rejects %s", (_name, msg) => {
    expect(parseToWorker(msg)).toBeUndefined();
  });

  it("trims the query: 100 characters between spaces is read, trimmed", () => {
    const padded = { ...SEARCH, query: `  ${"x".repeat(100)}\n` };
    expect(parseToWorker(padded)).toEqual({
      ...SEARCH,
      query: "x".repeat(100),
    });
  });

  it("reads season 100, the most seasons a title can have", () => {
    const last = { ...SEASON, season: 100 };
    expect(parseToWorker(last)).toEqual(last);
  });

  it("refuses a status-page sender, allows the Naka tab, for each type", () => {
    for (const raw of VALID) {
      const msg = parseToWorker(raw);
      if (msg === undefined) throw new Error("unparsed");
      expect(allowedFor("status-page", msg)).toBe(false);
      expect(allowedFor("naka-tab", msg)).toBe(true);
    }
  });
});

const SC_URL = "https://www.senscritique.com/film/solaris/2005";
const FLAGS = { canUndo: false, canRemove: false, protected: false };

describe("title page answers", () => {
  const cand = { id: 9, title: "A", type: "serie" };

  it("reads a FicheInfo", () => {
    const info = {
      state: "linked",
      product: {
        id: 3,
        average: 7.4,
        mine: null,
        label: { title: "Dark" },
        ...FLAGS,
      },
    };
    expect(parseFicheInfo(info)).toEqual(info);
    const labelled = {
      state: "matched",
      product: {
        id: 3,
        average: null,
        mine: 8,
        label: { title: "Solaris", year: 1972 },
        canUndo: true,
        canRemove: true,
        protected: false,
        url: SC_URL,
      },
    };
    expect(parseFicheInfo(labelled)).toEqual(labelled);
    const yearless = { ...labelled.product, label: { title: "Solaris" } };
    expect(parseFicheInfo({ state: "linked", product: yearless })).toEqual({
      state: "linked",
      product: yearless,
    });
    const choose = { state: "choose", candidates: [cand] };
    expect(parseFicheInfo(choose)).toEqual(choose);
    expect(parseFicheInfo({ state: "notfound" })).toEqual({
      state: "notfound",
    });
  });

  it.each([
    { state: "other" },
    { state: "linked", token: "t" },
    { state: "linked", product: { id: 0, average: null, mine: null } },
    { state: "linked", product: { id: 1, average: 11, mine: null } },
    { state: "linked", product: { id: 1, average: null, mine: 0 } },
    { state: "linked", product: { id: 1, average: null } },
    { state: "linked", product: { id: 1, average: null, mine: null } },
    {
      state: "linked",
      product: { id: 1, average: null, mine: null, label: { title: "" } },
    },
    {
      state: "linked",
      product: {
        id: 1,
        average: null,
        mine: null,
        label: { title: "x".repeat(201) },
      },
    },
    {
      state: "linked",
      product: {
        id: 1,
        average: null,
        mine: null,
        label: { title: "A", year: 1500 },
      },
    },
    {
      state: "linked",
      product: {
        id: 1,
        average: null,
        mine: null,
        label: { title: "A", x: 1 },
      },
    },
    { state: "choose", candidates: [{ ...cand, x: 1 }] },
    { state: "choose", candidates: Array.from({ length: 50 }, () => cand) },
    null,
  ])("rejects a bad FicheInfo %#", (raw) => {
    expect(() => parseFicheInfo(raw)).toThrow();
  });

  it("reads the season, mine, rate and link answers", () => {
    const season = { episodes: [{ episode: 1, productId: 4, average: null }] };
    expect(parseSeasonAnswer(season)).toEqual(season);
    const titled = {
      episodes: [{ episode: 1, productId: 4, average: 7, title: "Pilote" }],
    };
    expect(parseSeasonAnswer(titled)).toEqual(titled);
    expect(parseMineAnswer({ mine: 6, average: 7.4 })).toEqual({
      mine: 6,
      average: 7.4,
    });
    expect(parseMineAnswer({ mine: null, average: null })).toEqual({
      mine: null,
      average: null,
    });
    expect(parseMineAnswer({ mine: null, average: 0 })).toEqual({
      mine: null,
      average: 0,
    });
    expect(parseMineAnswer({ mine: 1, average: 10 })).toEqual({
      mine: 1,
      average: 10,
    });
    expect(parseRateAnswer({ ok: true })).toEqual({ ok: true });
    expect(parseRateAnswer({ error: "sc-session" })).toEqual({
      error: "sc-session",
    });
    for (const step of ["ma-liste", "local-save"]) {
      const sent = { sent: true, step, error: "naka-session" };
      expect(parseRateAnswer(sent)).toEqual(sent);
    }
    expect(parseLinkAnswer({ ok: true })).toEqual({ ok: true });
  });

  it("reads a search answer: its candidates, or none", () => {
    const found = { candidates: [cand, { ...cand, id: 10, year: 2002 }] };
    expect(parseSearchAnswer(found)).toEqual(found);
    expect(parseSearchAnswer({ candidates: [] })).toEqual({ candidates: [] });
  });

  it.each([
    ["no candidates", {}],
    ["an extra key", { candidates: [], state: "choose" }],
    ["a bad candidate", { candidates: [{ ...cand, x: 1 }] }],
    ["11 candidates", { candidates: Array.from({ length: 11 }, () => cand) }],
    ["not a record", null],
  ])("rejects a search answer with %s", (_name, raw) => {
    expect(() => parseSearchAnswer(raw)).toThrow();
  });

  it.each([
    () =>
      parseSeasonAnswer({
        episodes: [{ episode: 0, productId: 4, average: null }],
      }),
    () => parseSeasonAnswer({ episodes: [{ episode: 1, productId: 4 }] }),
    () => parseSeasonAnswer({ episodes: [], x: 1 }),
    () =>
      parseSeasonAnswer({
        episodes: [{ episode: 1, productId: 4, average: null, title: "" }],
      }),
    () =>
      parseSeasonAnswer({
        episodes: [
          { episode: 1, productId: 4, average: null, title: "x".repeat(201) },
        ],
      }),
    () =>
      parseSeasonAnswer({
        episodes: [{ episode: 1, productId: 4, average: null, title: 4 }],
      }),
    () => parseMineAnswer({ mine: 11, average: null }),
    () => parseMineAnswer({}),
    () => parseMineAnswer({ mine: 6 }),
    () => parseMineAnswer({ mine: 6, average: null, x: 1 }),
    () => parseMineAnswer({ mine: 6, average: 10.1 }),
    () => parseMineAnswer({ mine: 6, average: -0.1 }),
    () => parseMineAnswer({ mine: 6, average: "7" }),
    () => parseMineAnswer({ mine: 6, average: Number.NaN }),
    () => parseRateAnswer({ ok: true, x: 1 }),
    () => parseRateAnswer({ error: "sc-session", x: 1 }),
    () => parseRateAnswer({ error: "nope" }),
    () => parseRateAnswer({ ok: true, error: "sc-session" }),
    () => parseRateAnswer({ ok: false }),
    () => parseRateAnswer({ sent: true }),
    () => parseRateAnswer({ sent: false, error: "sc-session" }),
    () => parseRateAnswer({ sent: true, step: "ma-liste", error: "nope" }),
    () =>
      parseRateAnswer({
        sent: true,
        step: "ma-liste",
        error: "sc-session",
        ok: true,
      }),
    () => parseRateAnswer({ sent: true, error: "sc-session" }),
    () => parseRateAnswer({ sent: true, step: "cards", error: "sc-session" }),
    () => parseRateAnswer({ sent: true, step: null, error: "sc-session" }),
    () => parseLinkAnswer({ ok: false }),
    () => parseLinkAnswer({ ok: true, x: 1 }),
  ])("rejects a bad answer %#", (parse) => {
    expect(parse).toThrow();
  });

  it("reads a season of 500 episodes and refuses one of 501", () => {
    const episodes = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        episode: i + 1,
        productId: 4000 + i,
        average: null,
      }));
    expect(
      parseSeasonAnswer({ episodes: episodes(500) }).episodes,
    ).toHaveLength(500);
    expect(() => parseSeasonAnswer({ episodes: episodes(501) })).toThrow(
      "stored state: episodes",
    );
  });
});

describe("the panel's flags in the answers", () => {
  const product = (over: Record<string, unknown> = {}) => ({
    state: "linked",
    product: {
      id: 3,
      average: null,
      mine: 8,
      label: { title: "Solaris" },
      ...FLAGS,
      ...over,
    },
  });
  const panel = {
    canUndo: true,
    canRemove: false,
    protected: true,
    url: SC_URL,
  };

  it.each([
    ["a film page", SC_URL],
    ["a season page", "https://www.senscritique.com/serie/dark/13/S2"],
  ])("reads the product's flags with %s", (_n, url) => {
    const raw = product({ canUndo: true, canRemove: true, url });
    expect(parseFicheInfo(raw)).toEqual(raw);
  });

  it.each([
    ["no undo flag", { canUndo: undefined }],
    ["no removal flag", { canRemove: undefined }],
    ["a text undo flag", { canUndo: "true" }],
    ["a numeric removal flag", { canRemove: 1 }],
    ["no protected flag", { protected: undefined }],
    ["a text protected flag", { protected: "false" }],
    ["a page of another site", { url: "https://x.com/film/a/1" }],
    ["a protocol-relative page", { url: "//www.senscritique.com/film/a/1" }],
    ["a script page", { url: "javascript:alert(1)" }],
    ["a page with ..", { url: "https://www.senscritique.com/film/../1" }],
    ["a relative page", { url: "/film/solaris/2005" }],
    ["an empty page", { url: "" }],
    [
      "a page over 300 characters",
      { url: `https://www.senscritique.com/film/${"a".repeat(270)}/1` },
    ],
    ["a numeric page", { url: 5 }],
  ])("rejects a product with %s", (_n, over) => {
    expect(() => parseFicheInfo(product(over))).toThrow();
  });

  it.each([
    ["one millisecond", 1],
    ["the whole window", 600_000],
  ])("reads how long « Annuler » stays offered: %s", (_n, left) => {
    const raw = product({ canUndo: true, undoLeftMs: left });
    expect(parseFicheInfo(raw)).toEqual(raw);
    const ok = { ok: true, panel: { ...panel, undoLeftMs: left } };
    expect(parseRateAnswer(ok)).toEqual(ok);
  });

  it.each([
    ["no time left", { canUndo: true, undoLeftMs: 0 }],
    ["more than the window", { canUndo: true, undoLeftMs: 600_001 }],
    ["a fraction of a millisecond", { canUndo: true, undoLeftMs: 1.5 }],
    ["a text time", { canUndo: true, undoLeftMs: "5" }],
    ["a time without « Annuler »", { canUndo: false, undoLeftMs: 5000 }],
  ])("rejects a product with %s", (_n, over) => {
    expect(() => parseFicheInfo(product(over))).toThrow();
    const raw = { ok: true, panel: { ...panel, ...over } };
    expect(() => parseRateAnswer(raw)).toThrow();
  });

  it("reads the flags on a rating that went out, with and without a page", () => {
    const ok = { ok: true, panel };
    expect(parseRateAnswer(ok)).toEqual(ok);
    const bare = {
      ok: true,
      panel: { canUndo: false, canRemove: false, protected: false },
    };
    expect(parseRateAnswer(bare)).toEqual(bare);
    const sent = { sent: true, step: "ma-liste", error: "naka-session", panel };
    expect(parseRateAnswer(sent)).toEqual(sent);
  });

  it("reads the flags on a rating that did not go out after its finish wrote", () => {
    const wrote = { error: "unavailable", panel };
    expect(parseRateAnswer(wrote)).toEqual(wrote);
    expect(parseRateAnswer({ error: "unavailable" })).toEqual({
      error: "unavailable",
    });
  });

  it("reads « Ma liste » left to the tab on a rating that went out", () => {
    const tab = { ok: true, maListe: "tab", panel };
    expect(parseRateAnswer(tab)).toEqual(tab);
  });

  it.each([
    ["by the client", { ok: true, maListe: "client" }],
    ["by nobody", { ok: true, maListe: "none" }],
    [
      "on a rating sent with an error",
      { sent: true, step: "ma-liste", error: "sc-session", maListe: "tab" },
    ],
    [
      "on a rating that did not go out",
      { error: "sc-session", maListe: "tab" },
    ],
  ])("rejects « Ma liste » %s", (_n, raw) => {
    expect(() => parseRateAnswer(raw)).toThrow();
  });

  it.each([
    [
      "on a rating that did not go out, incomplete",
      { error: "sc-session", panel: { canUndo: true } },
    ],
    ["without the undo flag", { ok: true, panel: { canRemove: true } }],
    ["without the removal flag", { ok: true, panel: { canUndo: true } }],
    [
      "without the protected flag",
      { ok: true, panel: { canUndo: true, canRemove: true } },
    ],
    ["with an extra key", { ok: true, panel: { ...panel, x: 1 } }],
    [
      "with a foreign page",
      { ok: true, panel: { ...panel, url: "https://x.com/a/b/1" } },
    ],
    ["not a record", { ok: true, panel: true }],
  ])("rejects a panel %s", (_n, raw) => {
    expect(() => parseRateAnswer(raw)).toThrow();
  });
});
