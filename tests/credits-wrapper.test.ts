import { describe, expect, it } from "vitest";
import { PAGE_CHANNEL, type PageEvent } from "../src/ext/messages";
import { wrapFetch } from "../src/page/fetch-wrapper";

const PAGE = "https://naka.cx/player?id=3&type=tv&season=23&episode=17";
const EPISODE =
  "/api/v1/skip-segments?tmdbId=1434&type=tv&season=23&episode=17";
const FILM = "/api/v1/skip-segments?tmdbId=603&type=movie";
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const PROBE = {
  hit: true,
  segments: {
    intro: [{ endMs: 34868, startMs: null }],
    recap: [],
    credits: [{ endMs: null, startMs: 1221305 }],
    preview: [],
  },
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

describe("skip-segments, wrapped", () => {
  it("the probe's answer posts the credits start, and the page reads the very same response", async () => {
    const p = page(json(PROBE_TEXT));
    const response = await p.wrapped(EPISODE);
    expect(response).toBe(p.returned[0]);
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual(PROBE);
    await settle();
    expect(p.posted).toEqual([
      {
        channel: PAGE_CHANNEL,
        kind: "credits",
        startMs: 1221305,
        season: 23,
        episode: 17,
      },
    ]);
  });

  it("a film's answer posts no season or episode", async () => {
    const p = page(json(PROBE_TEXT));
    await p.wrapped(FILM);
    await settle();
    expect(p.posted).toEqual([
      { channel: PAGE_CHANNEL, kind: "credits", startMs: 1221305 },
    ]);
  });

  it.each([
    ["a non-JSON body", json("<html>oops</html>")],
    ["an answer without credits", json('{"hit":false,"segments":{}}')],
    ["a refused request (404)", json(PROBE_TEXT, 404)],
    ["a server error (500)", json(PROBE_TEXT, 500)],
  ])(
    "%s posts nothing, and the page still reads its body",
    async (_n, answer) => {
      const p = page(answer);
      const response = await p.wrapped(EPISODE);
      expect(response).toBe(p.returned[0]);
      expect(response.bodyUsed).toBe(false);
      await response.text();
      await settle();
      expect(p.posted).toEqual([]);
    },
  );

  it.each([
    ["a POST", EPISODE, "POST"],
    ["another path", "/api/v1/skip-segments/x?type=movie", "GET"],
  ])("%s is never read", async (_n, url, method) => {
    let cloned = false;
    const p = page(() => {
      const response = new Response(PROBE_TEXT);
      response.clone = () => {
        cloned = true;
        return new Response(PROBE_TEXT);
      };
      return response;
    });
    await p.wrapped(url, { method });
    await settle();
    expect(p.posted).toEqual([]);
    expect(cloned).toBe(false);
  });

  it("an answer that cannot be cloned changes nothing for the page", async () => {
    const p = page(() => {
      const response = new Response(PROBE_TEXT);
      response.clone = () => {
        throw new TypeError("body used");
      };
      return response;
    });
    const response = await p.wrapped(EPISODE);
    expect(response).toBe(p.returned[0]);
    expect(await response.json()).toEqual(PROBE);
    await settle();
    expect(p.posted).toEqual([]);
  });

  it("never reads a header of the response", async () => {
    const p = page(() => {
      const response = new Response(PROBE_TEXT);
      Object.defineProperty(response, "headers", {
        get() {
          throw new Error("a header was read");
        },
      });
      return response;
    });
    await p.wrapped(EPISODE);
    await settle();
    expect(p.posted).toHaveLength(1);
  });
});
