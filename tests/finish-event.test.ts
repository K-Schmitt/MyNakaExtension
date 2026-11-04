import { describe, expect, it } from "vitest";
import { type FinishEvent, handleFinish } from "../src/core/finish-handler";
import { DEFAULT_THRESHOLDS, type Thresholds } from "../src/core/watch-trigger";
import {
  asEvent,
  cand,
  episode,
  FILM,
  FILM_SC,
  FILM_TITLE,
  failure,
  film,
  SERIES_TITLE,
  world,
  writesOf,
} from "./finish-fakes";

describe("the event is checked before any port call", () => {
  const MALFORMED = "finish event: malformed event";
  const SOURCE = "finish event: unknown source";
  const CONTENT_ID = "finish event: contentId must be a positive safe integer";
  const PROGRESS = "finish event: progress must be a finite number from 0 to 1";
  const TITLE = "finish event: title must not be empty";
  const ORIGINAL = "finish event: originalTitle must be a string";
  const YEAR = "finish event: year must be a whole number from 1800 to 3000";
  const withTitled = (extra: Record<string, unknown>) =>
    asEvent({ ...film(), titled: { ...FILM_TITLE, ...extra } });
  const MEDIA = "finish event: unknown media type";
  const MOVIE_TYPE = "finish event: a movie needs a film title";
  const MOVIE_PARTS = "finish event: a movie has no season or episode";
  const TV_TYPE = "finish event: an episode needs a series title";
  const TV_PARTS =
    "finish event: season and episode must be positive safe integers";
  const MOVIE = { contentId: FILM, mediaType: "movie" } as const;
  const titled = (title: unknown) =>
    asEvent({ ...film(), titled: { ...FILM_TITLE, title } });
  const tvWithout = (key: "season" | "episode") => {
    const naka: Record<string, unknown> = { ...episode(1, 2).naka };
    delete naka[key];
    return asEvent({ ...episode(1, 2), naka });
  };

  const BAD: [string, FinishEvent, string][] = [
    ["a null event", asEvent(null), MALFORMED],
    [
      "an event without naka",
      asEvent({ ...film(), naka: undefined }),
      MALFORMED,
    ],
    [
      "an event without titled",
      asEvent({ ...film(), titled: null }),
      MALFORMED,
    ],
    ["an unknown source", asEvent({ ...film(), source: "auto" }), SOURCE],
    ["contentId 0", film({ naka: { ...MOVIE, contentId: 0 } }), CONTENT_ID],
    ["contentId -1", film({ naka: { ...MOVIE, contentId: -1 } }), CONTENT_ID],
    ["contentId 1.5", film({ naka: { ...MOVIE, contentId: 1.5 } }), CONTENT_ID],
    [
      "contentId NaN",
      film({ naka: { ...MOVIE, contentId: Number.NaN } }),
      CONTENT_ID,
    ],
    [
      "contentId 2 ** 53",
      film({ naka: { ...MOVIE, contentId: 2 ** 53 } }),
      CONTENT_ID,
    ],
    [
      "contentId as a string",
      asEvent({ ...film(), naka: { ...MOVIE, contentId: "42" } }),
      CONTENT_ID,
    ],
    [
      "an episode with contentId 0",
      episode(1, 2, {
        naka: { contentId: 0, mediaType: "tv", season: 1, episode: 2 },
      }),
      CONTENT_ID,
    ],
    ["progress NaN", film({ progress: Number.NaN }), PROGRESS],
    ["progress -0.01", film({ progress: -0.01 }), PROGRESS],
    [
      "progress Infinity",
      film({ progress: Number.POSITIVE_INFINITY }),
      PROGRESS,
    ],
    [
      "progress as a string",
      asEvent({ ...film(), progress: "0.95" }),
      PROGRESS,
    ],
    ["progress 1.5", film({ progress: 1.5 }), PROGRESS],
    [
      "progress 1.67 (a percentage passed by mistake)",
      film({ progress: 1.67 }),
      PROGRESS,
    ],
    ["progress 95 (a percentage)", film({ progress: 95 }), PROGRESS],
    ["an empty title", titled(""), TITLE],
    ["a blank title", titled(" \t\n "), TITLE],
    ["a title that is not a string", titled(42), TITLE],
    [
      "an originalTitle that is an object",
      withTitled({ originalTitle: { $gt: "" } }),
      ORIGINAL,
    ],
    [
      "an originalTitle that is a number",
      withTitled({ originalTitle: 42 }),
      ORIGINAL,
    ],
    ["a null originalTitle", withTitled({ originalTitle: null }), ORIGINAL],
    ["year 1799", withTitled({ year: 1799 }), YEAR],
    ["year 3001", withTitled({ year: 3001 }), YEAR],
    ["year 2001.5", withTitled({ year: 2001.5 }), YEAR],
    ["year as a string", withTitled({ year: "2001" }), YEAR],
    ["year NaN", withTitled({ year: Number.NaN }), YEAR],
    ["a null year", withTitled({ year: null }), YEAR],
    [
      "an unknown media type",
      asEvent({ ...film(), naka: { contentId: FILM, mediaType: "music" } }),
      MEDIA,
    ],
    ["a movie with a series title", film({ titled: SERIES_TITLE }), MOVIE_TYPE],
    [
      "a movie with a season",
      film({ naka: { ...MOVIE, season: 1 } }),
      MOVIE_PARTS,
    ],
    [
      "a movie with an episode",
      film({ naka: { ...MOVIE, episode: 1 } }),
      MOVIE_PARTS,
    ],
    [
      "an episode with a film title",
      episode(1, 2, { titled: FILM_TITLE }),
      TV_TYPE,
    ],
    ["an episode without a season", tvWithout("season"), TV_PARTS],
    ["an episode without an episode number", tvWithout("episode"), TV_PARTS],
    ["season 0", episode(0, 2), TV_PARTS],
    ["season 1.5", episode(1.5, 2), TV_PARTS],
    ["season NaN", episode(Number.NaN, 2), TV_PARTS],
    ["episode 0", episode(1, 0), TV_PARTS],
    ["episode -2", episode(1, -2), TV_PARTS],
    ["episode 2 ** 53", episode(1, 2 ** 53), TV_PARTS],
  ];

  it.each(BAD)(
    "rejects %s with a RangeError and calls no port",
    async (_name, event, message) => {
      const w = world();
      const error = await failure(
        handleFinish(event, w.ports, DEFAULT_THRESHOLDS),
      );
      expect(error).toBeInstanceOf(RangeError);
      expect(error.message).toBe(message);
      expect(w.calls).toEqual([]);
    },
  );

  it("checks the id before the progress", async () => {
    const w = world();
    const event = film({
      progress: Number.NaN,
      naka: { ...MOVIE, contentId: 0 },
    });
    expect(
      (await failure(handleFinish(event, w.ports, DEFAULT_THRESHOLDS))).message,
    ).toBe(CONTENT_ID);
  });

  it.each([
    ["contentId 1", film({ naka: { ...MOVIE, contentId: 1 } })],
    [
      "the largest safe contentId",
      film({ naka: { ...MOVIE, contentId: Number.MAX_SAFE_INTEGER } }),
    ],
    [
      "progress 0 on an explicit event",
      film({ source: "explicit", progress: 0 }),
    ],
    ["progress 1", film({ progress: 1 })],
    [
      "a title with spaces around it",
      film({ titled: { ...FILM_TITLE, title: " Le Film " } }),
    ],
  ])("accepts %s", async (_name, event) => {
    const w = world({ search: { " Le Film ": [cand(FILM_SC, FILM_TITLE)] } });
    expect(await handleFinish(event, w.ports, DEFAULT_THRESHOLDS)).toEqual({
      kind: "done",
      ratingTargets: [{ label: "film", productId: FILM_SC }],
    });
  });

  it.each([
    ["year 1800", withTitled({ year: 1800 })],
    ["year 3000", withTitled({ year: 3000 })],
    ["no year", withTitled({ year: undefined })],
    ["a string originalTitle", withTitled({ originalTitle: "The Film" })],
    ["an empty originalTitle", withTitled({ originalTitle: "" })],
    ["no originalTitle", withTitled({ originalTitle: undefined })],
  ])("accepts %s and goes on to the load", async (_name, event) => {
    const w = world();
    await handleFinish(event, w.ports, DEFAULT_THRESHOLDS);
    expect(w.calls[0]).toBe("load");
  });

  it("accepts season 1 episode 1", async () => {
    const w = world();
    const outcome = await handleFinish(
      episode(1, 1),
      w.ports,
      DEFAULT_THRESHOLDS,
    );
    expect(outcome.kind).toBe("done");
    expect(w.calls).toContain("markDone:5001:2026-11-03");
  });
});

const both = (threshold: number): Thresholds => ({
  film: threshold,
  episode: threshold,
});

describe("order of the run: load, threshold, handled", () => {
  it("a load that fails rejects with no other call", async () => {
    const w = world({ fail: ["load"] });
    expect(
      (await failure(handleFinish(film(), w.ports, DEFAULT_THRESHOLDS)))
        .message,
    ).toBe("load failed");
    expect(w.calls).toEqual(["load"]);
  });

  it.each([
    ["threshold", 0],
    ["threshold", -0.5],
    ["threshold", 1.01],
    ["threshold", Number.NaN],
    ["explicit", 0],
    ["explicit", Number.NaN],
  ] as const)(
    "a %s event with a threshold of %s rejects after the load only",
    async (source, threshold) => {
      const w = world();
      const error = await failure(
        handleFinish(film({ source }), w.ports, both(threshold)),
      );
      expect(error).toBeInstanceOf(RangeError);
      expect(error.message).toContain("threshold must be in (0, 1]");
      expect(w.calls).toEqual(["load"]);
    },
  );

  it("a bad threshold rejects even for a handled title", async () => {
    const w = world({ state: { handled: ["movie:42"] } });
    expect(
      await failure(handleFinish(film(), w.ports, both(0))),
    ).toBeInstanceOf(RangeError);
  });

  it("a low progress on a handled title reports below-threshold", async () => {
    const w = world({ state: { handled: ["movie:42"] } });
    expect(
      await handleFinish(film({ progress: 0.5 }), w.ports, DEFAULT_THRESHOLDS),
    ).toEqual({
      kind: "ignored",
      reason: "below-threshold",
    });
    expect(w.calls).toEqual(["load"]);
  });

  it.each(["threshold", "explicit"] as const)(
    "a complete %s event on a handled film is ignored after the load only",
    async (source) => {
      const w = world({ state: { handled: ["movie:42"] } });
      expect(
        await handleFinish(film({ source }), w.ports, DEFAULT_THRESHOLDS),
      ).toEqual({
        kind: "ignored",
        reason: "already-handled",
      });
      expect(w.calls).toEqual(["load"]);
    },
  );
});

describe("threshold", () => {
  it("a threshold event at 0.01 is ignored after the load only (anti-goal)", async () => {
    const w = world();
    expect(
      await handleFinish(film({ progress: 0.01 }), w.ports, DEFAULT_THRESHOLDS),
    ).toEqual({
      kind: "ignored",
      reason: "below-threshold",
    });
    expect(w.calls).toEqual(["load"]);
  });

  it("an explicit event at 0.01 completes", async () => {
    const w = world();
    const outcome = await handleFinish(
      film({ source: "explicit", progress: 0.01 }),
      w.ports,
      DEFAULT_THRESHOLDS,
    );
    expect(outcome.kind).toBe("done");
    expect(writesOf(w.calls)).toEqual([
      "unwish:1042",
      "markDone:1042:2026-11-03",
    ]);
  });

  it.each([
    [film(), "markDone:1042:2027-01-31"],
    [episode(1, 2), "markDone:5002:2027-01-31"],
  ])("marks done on the date today() gives", async (event, write) => {
    const w = world({ today: "2027-01-31" });
    await handleFinish(event, w.ports, DEFAULT_THRESHOLDS);
    expect(writesOf(w.calls).slice(-1)).toEqual([write]);
  });

  it.each([
    [0.9, 0.9, "done"],
    [0.9, 0.8999, "ignored"],
    [0.5, 0.6, "done"],
    [0.97, 0.96, "ignored"],
    [1, 1, "done"],
  ])(
    "with a film threshold of %s, a progress of %s is %s",
    async (threshold, progress, kind) => {
      const w = world();
      const outcome = await handleFinish(
        film({ progress }),
        w.ports,
        both(threshold),
      );
      expect(outcome.kind).toBe(kind);
    },
  );
});

describe("content keys", () => {
  it.each([
    [["movie:42"], "ignored"],
    [["movie:43"], "done"],
    [["movie:4"], "done"],
    [["tv:42:S1E1"], "done"],
  ])("handled %j: film 42 is %s", async (handled, kind) => {
    const w = world({ state: { handled } });
    expect((await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS)).kind).toBe(
      kind,
    );
  });

  it.each([
    [["tv:7:S1E2"], 1, 2, "ignored"],
    [["tv:7:S1E2"], 1, 3, "done"],
    [["tv:7:S1E2"], 2, 1, "done"],
    [["tv:7:S2E1"], 1, 2, "done"],
    [["movie:7"], 1, 2, "done"],
    [["tv:7:S1E1"], 1, 1, "ignored"],
  ])(
    "handled %j: S%sE%s of series 7 is %s",
    async (handled, season, number, kind) => {
      const w = world({ state: { handled } });
      expect(
        (
          await handleFinish(
            episode(season, number),
            w.ports,
            DEFAULT_THRESHOLDS,
          )
        ).kind,
      ).toBe(kind);
    },
  );

  it("records movie:<id> after a film", async () => {
    const w = world({ state: { handled: ["other"] } });
    await handleFinish(film(), w.ports, DEFAULT_THRESHOLDS);
    expect(w.state.handled).toEqual(["other", "movie:42"]);
  });

  it("records tv:<id>:S<s>E<e> after an episode", async () => {
    const w = world();
    await handleFinish(episode(2, 1), w.ports, DEFAULT_THRESHOLDS);
    expect(w.state.handled).toEqual(["tv:7:S2E1"]);
  });
});
