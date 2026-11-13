import { describe, expect, it } from "vitest";
import { PAGE_CHANNEL, type PageEvent } from "../src/ext/messages";
import {
  createFicheMemory,
  MAX_CONTENTS,
  MAX_SEASONS,
  MAX_TITLES,
} from "../src/page/fiche-memory";

const fiche = (tmdbId: number, contentId = tmdbId + 1000): PageEvent => ({
  channel: PAGE_CHANNEL,
  kind: "fiche",
  contentId,
  tmdbId,
  mediaType: "tv",
  title: "Les Griffin",
});
const season = (contentId: number, n: number): PageEvent => ({
  channel: PAGE_CHANNEL,
  kind: "season",
  contentId,
  season: n,
});
const seasonsOf = (events: readonly PageEvent[]) =>
  events.flatMap((event) => (event.kind === "season" ? [event.season] : []));

describe("the title page events the MAIN relay keeps", () => {
  it("replays the path's fiche event, then its content's seasons in the order the page fetched them", () => {
    const memory = createFicheMemory();
    memory.keep(season(1434, 3));
    memory.keep(fiche(434, 1434));
    memory.keep(season(1434, 1));
    memory.keep(season(99, 1));
    expect(memory.replay("/content/tv/434")).toEqual([
      fiche(434, 1434),
      season(1434, 3),
      season(1434, 1),
    ]);
  });

  it("replays nothing for another tmdbId, the other media type or another path", () => {
    const memory = createFicheMemory();
    memory.keep(fiche(434));
    memory.keep(season(1434, 1));
    for (const path of [
      "/content/tv/435",
      "/content/movie/434",
      "/content/tv/434/",
      "/player",
    ]) {
      expect(memory.replay(path)).toEqual([]);
    }
  });

  it("replays the newest fiche event of a title", () => {
    const memory = createFicheMemory();
    memory.keep(fiche(434, 1));
    memory.keep(fiche(434, 2));
    expect(memory.replay("/content/tv/434")).toEqual([fiche(434, 2)]);
  });

  it("keeps no other page event", () => {
    const memory = createFicheMemory();
    memory.keep({ channel: PAGE_CHANNEL, kind: "playlist" });
    memory.keep({ channel: PAGE_CHANNEL, kind: "watched", contentId: 1434 });
    memory.keep(fiche(434, 1434));
    expect(memory.replay("/content/tv/434")).toEqual([fiche(434, 1434)]);
  });

  it(`keeps ${MAX_TITLES} titles, the oldest dropped, one kept again counting as new`, () => {
    const memory = createFicheMemory();
    for (let id = 1; id <= MAX_TITLES; id++) memory.keep(fiche(id));
    memory.keep(fiche(1));
    memory.keep(fiche(MAX_TITLES + 1));
    expect(memory.replay("/content/tv/1")).toHaveLength(1);
    expect(memory.replay("/content/tv/2")).toEqual([]);
    expect(memory.replay(`/content/tv/${MAX_TITLES + 1}`)).toHaveLength(1);
  });

  it(`keeps ${MAX_SEASONS} seasons per content, the oldest dropped`, () => {
    const memory = createFicheMemory();
    memory.keep(fiche(434, 1434));
    for (let n = 1; n <= MAX_SEASONS + 1; n++) memory.keep(season(1434, n));
    memory.keep(season(1434, 2));
    const seasons = seasonsOf(memory.replay("/content/tv/434"));
    expect(seasons).toHaveLength(MAX_SEASONS);
    expect(seasons).not.toContain(1);
    expect(seasons.at(-1)).toBe(2);
  });

  it(`keeps the seasons of ${MAX_CONTENTS} contents, the oldest dropped`, () => {
    const memory = createFicheMemory();
    memory.keep(fiche(434, 1));
    memory.keep(fiche(435, 2));
    for (let id = 1; id <= MAX_CONTENTS + 1; id++) memory.keep(season(id, 1));
    expect(memory.replay("/content/tv/434")).toEqual([fiche(434, 1)]);
    expect(seasonsOf(memory.replay("/content/tv/435"))).toEqual([1]);
  });
});
