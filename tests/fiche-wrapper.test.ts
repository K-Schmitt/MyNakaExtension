import { describe, expect, it } from "vitest";
import { PAGE_CHANNEL, type PageEvent } from "../src/ext/messages";
import { wrapFetch } from "../src/page/fetch-wrapper";

const PAGE = "https://naka.cx/content/tv/1434";
const FICHE = "/api/v1/browse/by-tmdb/tv/1434";
const SEASON = "/api/v1/browse/12/season/3";
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const PROBE = {
  id: 21391,
  tmdbId: 1434,
  mediaType: "tv",
  title: "Les Griffin",
  originalTitle: "Family Guy",
  releaseDate: "1999-01-31",
  posterPath: "/poster.jpg",
  numberOfSeasons: 23,
};
const PROBE_TEXT = JSON.stringify(PROBE);

function page(answer: () => Response) {
  const returned: Response[] = [];
  const original = (async () => {
    const response = answer();
    returned.push(response);
    return response;
  }) as unknown as typeof fetch;
  const posted: PageEvent[] = [];
  const wrapped = wrapFetch(
    original,
    (event) => posted.push(event),
    () => PAGE,
  );
  return { returned, posted, wrapped };
}

const json =
  (body: string, status = 200) =>
  () =>
    new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    });

// A response whose clone is recorded, and whose headers may never be read.
function watchedResponse(body: string, status = 200) {
  const state = { cloned: false };
  const response = new Response(body, { status });
  const clone = response.clone.bind(response);
  response.clone = () => {
    state.cloned = true;
    return clone();
  };
  Object.defineProperty(response, "headers", {
    get() {
      throw new Error("a header was read");
    },
  });
  return { state, response };
}

describe("by-tmdb, wrapped", () => {
  it("the probe's answer posts the fiche, and the page reads the very same response", async () => {
    const p = page(json(PROBE_TEXT));
    const response = await p.wrapped(FICHE);
    expect(response).toBe(p.returned[0]);
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual(PROBE);
    await settle();
    expect(p.posted).toEqual([
      {
        channel: PAGE_CHANNEL,
        kind: "fiche",
        contentId: 21391,
        tmdbId: 1434,
        mediaType: "tv",
        title: "Les Griffin",
        originalTitle: "Family Guy",
        year: 1999,
      },
    ]);
  });

  it.each([
    ["a non-JSON body", json("<html>oops</html>")],
    [
      "a title of 201 characters",
      json(JSON.stringify({ ...PROBE, title: "x".repeat(201) })),
    ],
    ["a refused request (404)", json(PROBE_TEXT, 404)],
    ["a server error (500)", json(PROBE_TEXT, 500)],
  ])(
    "%s posts nothing, and the page still reads its body",
    async (_n, answer) => {
      const p = page(answer);
      const response = await p.wrapped(FICHE);
      expect(response).toBe(p.returned[0]);
      expect(response.bodyUsed).toBe(false);
      await response.text();
      await settle();
      expect(p.posted).toEqual([]);
    },
  );

  it.each([
    ["a POST", FICHE, "POST"],
    ["another path", "/api/v1/browse/by-tmdb/tv/1434/similar", "GET"],
  ])("%s is never read", async (_n, url, method) => {
    const watched = watchedResponse(PROBE_TEXT);
    const p = page(() => watched.response);
    await p.wrapped(url, { method });
    await settle();
    expect(p.posted).toEqual([]);
    expect(watched.state.cloned).toBe(false);
  });

  it("never reads a header of the response", async () => {
    const watched = watchedResponse(PROBE_TEXT);
    const p = page(() => watched.response);
    await p.wrapped(FICHE);
    await settle();
    expect(p.posted).toHaveLength(1);
  });

  it("an answer that cannot be cloned changes nothing for the page", async () => {
    const p = page(() => {
      const response = new Response(PROBE_TEXT);
      response.clone = () => {
        throw new TypeError("body used");
      };
      return response;
    });
    const response = await p.wrapped(FICHE);
    expect(response).toBe(p.returned[0]);
    expect(await response.json()).toEqual(PROBE);
    await settle();
    expect(p.posted).toEqual([]);
  });
});

describe("season, wrapped", () => {
  it("an ok answer posts the season, without reading the body", async () => {
    const watched = watchedResponse('{"episodes":[]}');
    const p = page(() => watched.response);
    const response = await p.wrapped(SEASON);
    expect(response).toBe(p.returned[0]);
    await settle();
    expect(p.posted).toEqual([
      { channel: PAGE_CHANNEL, kind: "season", contentId: 12, season: 3 },
    ]);
    expect(watched.state.cloned).toBe(false);
    expect(response.bodyUsed).toBe(false);
  });

  it("a refused answer posts nothing", async () => {
    const p = page(json("{}", 404));
    await p.wrapped(SEASON);
    await settle();
    expect(p.posted).toEqual([]);
  });
});
