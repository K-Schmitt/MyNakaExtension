import { describe, expect, it } from "vitest";
import {
  parseSettings,
  pauseFromOf,
  type Settings,
  thresholdsOf,
} from "../src/ext/settings";
import { StoredStateError } from "../src/ext/stored-error";

const MARK = "SECRET-MARKER";

const report = {
  added: [{ nakaId: 1, scId: 2 }],
  deferred: [],
  failed: [{ nakaId: 3, scId: 4 }],
  alreadyDone: [],
  pendingRemovals: 1,
  unresolved: 2,
};

function full(): Settings {
  return {
    mode: "live",
    binding: { scUsername: "someone", nakaAccount: "acct" },
    lastAutoRunAt: 1_700_000_000_000,
    lastRun: {
      at: 1_700_000_000_500,
      trigger: "playlist",
      mode: "simulation",
      outcome: "ok",
      report,
      preview: [
        { side: "naka", title: "A film" },
        { side: "sc", title: "A show" },
      ],
    },
    lastFinish: { at: 1_700_000_001_000, key: "tv:7:S1E2", outcome: "done" },
  };
}

function rejection(raw: unknown): unknown {
  try {
    parseSettings(raw);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("lastAnswer", () => {
  const lastAnswer = {
    seq: 4,
    at: 1_700_000_002_000,
    target: "removal:sc:1:101",
    outcome: "failed",
    error: "unavailable",
  };

  it("the exact 4a settings parse with no lastAnswer", () => {
    expect("lastAnswer" in parseSettings(full())).toBe(false);
    expect("lastAnswer" in parseSettings({ mode: "live" })).toBe(false);
  });

  it("a stored lastAnswer round-trips", () => {
    expect(parseSettings({ mode: "live", lastAnswer })).toEqual({
      mode: "live",
      lastAnswer,
    });
  });

  it("a bad lastAnswer names its path", () => {
    for (const bad of [null, { ...lastAnswer, error: undefined }, "x"]) {
      expect(rejection({ mode: "live", lastAnswer: bad })).toMatchObject({
        path: expect.stringMatching(/^settings\.lastAnswer/),
      });
    }
  });
});

describe("parseSettings accepts", () => {
  it("an absent key as simulation", () => {
    expect(parseSettings(undefined)).toEqual({ mode: "simulation" });
  });

  it("a full value, unchanged", () => {
    expect(parseSettings(full())).toEqual(full());
  });

  it("a minimal live value", () => {
    expect(parseSettings({ mode: "live" })).toEqual({ mode: "live" });
  });

  it("zero values and empty strings where they are legal", () => {
    const value = {
      mode: "live",
      binding: { scUsername: "u", nakaAccount: "" },
      lastAutoRunAt: 0,
      lastRun: {
        at: 0,
        trigger: "button",
        mode: "live",
        outcome: "ok",
        report: {
          added: [],
          deferred: [],
          failed: [],
          alreadyDone: [],
          pendingRemovals: 0,
          unresolved: 0,
        },
        preview: [{ side: "sc", title: "" }],
      },
      lastFinish: { at: 0, key: "movie:0", outcome: "ignored" },
    };
    expect(parseSettings(value)).toEqual(value);
  });

  it("an empty preview list", () => {
    const lastRun = {
      at: 1,
      trigger: "button",
      mode: "live",
      outcome: "ok",
      preview: [],
    };
    expect(parseSettings({ mode: "live", lastRun })).toEqual({
      mode: "live",
      lastRun,
    });
  });

  it("a binding without a naka account", () => {
    const value = { mode: "simulation", binding: { scUsername: "u" } };
    expect(parseSettings(value)).toEqual(value);
  });

  it("a failed run with an error", () => {
    const lastRun = {
      at: 0,
      trigger: "button",
      mode: "live",
      outcome: "failed",
      error: "sc-session",
    };
    expect(parseSettings({ mode: "live", lastRun })).toEqual({
      mode: "live",
      lastRun,
    });
  });

  it("a finish with its title parses, and one without (4a) still does", () => {
    const withTitle = {
      at: 1,
      key: "movie:1",
      outcome: "done",
      title: "Enemy",
    };
    expect(parseSettings({ mode: "live", lastFinish: withTitle })).toEqual({
      mode: "live",
      lastFinish: withTitle,
    });
    const earlier = { at: 1, key: "tv:7:S1E2", outcome: "needs-choice" };
    expect(parseSettings({ mode: "live", lastFinish: earlier })).toEqual({
      mode: "live",
      lastFinish: earlier,
    });
  });

  it.each([42, null, {}, ["x"]])("a finish title %j is refused", (title) => {
    const lastFinish = { at: 1, key: "movie:1", outcome: "done", title };
    expect(() => parseSettings({ mode: "live", lastFinish })).toThrow();
  });

  it.each(["ignored", "needs-choice", "not-found", "done"])(
    "a finish outcome %s",
    (outcome) => {
      const lastFinish = { at: 1, key: "movie:1", outcome };
      expect(parseSettings({ mode: "live", lastFinish })).toEqual({
        mode: "live",
        lastFinish,
      });
    },
  );

  it.each([
    "no-naka-tab",
    "naka-session",
    "sc-session",
    "other-account",
    "stored-state",
    "unavailable",
    "finish-limit",
    "naka-list-empty",
    "naka-tab-changed",
  ])("a failed finish with its reason %s", (error) => {
    const lastFinish = { at: 1, key: "movie:1", outcome: "failed", error };
    expect(parseSettings({ mode: "live", lastFinish })).toEqual({
      mode: "live",
      lastFinish,
    });
  });

  it.each([
    { from: 0, count: 0 },
    { from: 1_700_000_000_000, count: 30 },
  ])("a finish window %o", (finishWindow) => {
    expect(parseSettings({ mode: "live", finishWindow })).toEqual({
      mode: "live",
      finishWindow,
    });
  });

  it("a stored Plan 3 run record parses, without year, type or next", () => {
    const lastRun = {
      at: 1,
      trigger: "button",
      mode: "simulation",
      outcome: "ok",
      report: {
        added: [],
        deferred: [],
        failed: [],
        alreadyDone: [],
        pendingRemovals: 0,
        unresolved: 0,
      },
      preview: [
        { side: "sc", title: "Film 1" },
        { side: "naka", title: "" },
      ],
    };
    expect(parseSettings({ mode: "simulation", lastRun })).toEqual({
      mode: "simulation",
      lastRun,
    });
  });

  it("a run record with year, type and next parses", () => {
    const item = { side: "sc", title: "Enemy", year: 2013, type: "film" };
    const lastRun = {
      at: 1,
      trigger: "button",
      mode: "live",
      outcome: "ok",
      preview: [item],
      next: [item, { side: "naka", title: "", type: "serie" }],
    };
    expect(parseSettings({ mode: "live", lastRun })).toEqual({
      mode: "live",
      lastRun,
    });
  });

  it.each([
    { year: 1799 },
    { year: 2101 },
    { year: 2013.5 },
    { year: "2013" },
    { type: "game" },
    { type: 1 },
    { extra: true },
  ])("a preview item with %o is refused", (bad) => {
    const lastRun = {
      at: 1,
      trigger: "button",
      mode: "live",
      outcome: "ok",
      next: [{ side: "sc", title: "x", ...bad }],
    };
    expect(() => parseSettings({ mode: "live", lastRun })).toThrow();
  });

  it.each(["naka-ready", "playlist", "button"])("trigger %s", (trigger) => {
    const lastRun = { at: 1, trigger, mode: "live", outcome: "ok" };
    expect(parseSettings({ mode: "live", lastRun })).toEqual({
      mode: "live",
      lastRun,
    });
  });

  it.each([
    "no-naka-tab",
    "naka-session",
    "sc-session",
    "other-account",
    "stored-state",
    "unavailable",
    "finish-limit",
    "naka-list-empty",
    "naka-tab-changed",
  ])("run error %s", (error) => {
    const lastRun = {
      at: 1,
      trigger: "button",
      mode: "live",
      outcome: "failed",
      error,
    };
    expect(parseSettings({ mode: "live", lastRun })).toEqual({
      mode: "live",
      lastRun,
    });
  });
});

const run = (patch: Record<string, unknown>) => ({
  mode: "live",
  lastRun: {
    at: 1,
    trigger: "button",
    mode: "live",
    outcome: "ok",
    ...patch,
  },
});

const finish = (patch: Record<string, unknown>) => ({
  mode: "live",
  lastFinish: { at: 1, key: "movie:1", outcome: "done", ...patch },
});

type Bad = { name: string; raw: unknown; path: string };

const bad = (name: string, path: string, raw: unknown): Bad => ({
  name,
  path,
  raw,
});

const NULLED: [string, unknown][] = [
  ["binding", { mode: "live", binding: null }],
  ["lastAutoRunAt", { mode: "live", lastAutoRunAt: null }],
  ["lastRun", { mode: "live", lastRun: null }],
  ["lastFinish", { mode: "live", lastFinish: null }],
  [
    "binding.nakaAccount",
    { mode: "live", binding: { scUsername: "u", nakaAccount: null } },
  ],
  ["lastRun.error", run({ error: null })],
  ["lastRun.report", run({ report: null })],
  ["lastRun.preview", run({ preview: null })],
];

const BAD_CASES: Bad[] = [
  ...NULLED.map(([name, raw]) => bad(`${name} null`, `settings.${name}`, raw)),
  bad("lastAutoRunAt false", "settings.lastAutoRunAt", {
    mode: "live",
    lastAutoRunAt: false,
  }),
  bad("lastRun error empty", "settings.lastRun.error", run({ error: "" })),
  bad("not an object", "settings", MARK),
  bad("null", "settings", null),
  bad("an array", "settings", []),
  bad("mode missing", "settings.mode", {}),
  bad("mode unknown", "settings.mode", { mode: MARK }),
  bad("an unknown key", "settings", { mode: "live", [MARK]: 1 }),
  bad("binding not an object", "settings.binding", {
    mode: "live",
    binding: MARK,
  }),
  bad("binding without a username", "settings.binding.scUsername", {
    mode: "live",
    binding: {},
  }),
  bad("binding with an empty username", "settings.binding.scUsername", {
    mode: "live",
    binding: { scUsername: "" },
  }),
  bad("binding username not a string", "settings.binding.scUsername", {
    mode: "live",
    binding: { scUsername: 4 },
  }),
  bad("binding naka account not a string", "settings.binding.nakaAccount", {
    mode: "live",
    binding: { scUsername: "u", nakaAccount: 4 },
  }),
  bad("binding with an unknown key", "settings.binding", {
    mode: "live",
    binding: { scUsername: "u", [MARK]: 1 },
  }),
  bad("lastAutoRunAt negative", "settings.lastAutoRunAt", {
    mode: "live",
    lastAutoRunAt: -1,
  }),
  bad("lastAutoRunAt fractional", "settings.lastAutoRunAt", {
    mode: "live",
    lastAutoRunAt: 1.5,
  }),
  bad("lastAutoRunAt a string", "settings.lastAutoRunAt", {
    mode: "live",
    lastAutoRunAt: MARK,
  }),
  bad("lastRun not an object", "settings.lastRun", {
    mode: "live",
    lastRun: MARK,
  }),
  bad("lastRun at negative", "settings.lastRun.at", run({ at: -1 })),
  bad("lastRun at missing", "settings.lastRun.at", run({ at: undefined })),
  bad(
    "lastRun trigger unknown",
    "settings.lastRun.trigger",
    run({
      trigger: MARK,
    }),
  ),
  bad("lastRun mode unknown", "settings.lastRun.mode", run({ mode: MARK })),
  bad(
    "lastRun outcome unknown",
    "settings.lastRun.outcome",
    run({
      outcome: MARK,
    }),
  ),
  bad("lastRun error unknown", "settings.lastRun.error", run({ error: MARK })),
  bad("lastRun with an unknown key", "settings.lastRun", run({ [MARK]: 1 })),
  bad(
    "lastRun report not an object",
    "settings.lastRun.report",
    run({
      report: MARK,
    }),
  ),
  bad(
    "report pair list not an array",
    "settings.lastRun.report.added",
    run({
      report: { ...report, added: MARK },
    }),
  ),
  bad(
    "report pair id invalid",
    "settings.lastRun.report.failed[0].scId",
    run({ report: { ...report, failed: [{ nakaId: 1, scId: 0 }] } }),
  ),
  bad(
    "report deferred missing",
    "settings.lastRun.report.deferred",
    run({ report: { ...report, deferred: undefined } }),
  ),
  bad(
    "report alreadyDone missing",
    "settings.lastRun.report.alreadyDone",
    run({ report: { ...report, alreadyDone: undefined } }),
  ),
  bad(
    "report pendingRemovals negative",
    "settings.lastRun.report.pendingRemovals",
    run({ report: { ...report, pendingRemovals: -1 } }),
  ),
  bad(
    "report unresolved negative",
    "settings.lastRun.report.unresolved",
    run({ report: { ...report, unresolved: -1 } }),
  ),
  bad(
    "report unresolved fractional",
    "settings.lastRun.report.unresolved",
    run({ report: { ...report, unresolved: 0.5 } }),
  ),
  bad(
    "report with an unknown key",
    "settings.lastRun.report",
    run({ report: { ...report, [MARK]: 1 } }),
  ),
  bad(
    "preview not an array",
    "settings.lastRun.preview",
    run({
      preview: MARK,
    }),
  ),
  bad(
    "preview side unknown",
    "settings.lastRun.preview[0].side",
    run({
      preview: [{ side: MARK, title: "t" }],
    }),
  ),
  bad(
    "preview title not a string",
    "settings.lastRun.preview[1].title",
    run({
      preview: [
        { side: "sc", title: "t" },
        { side: "sc", title: 4 },
      ],
    }),
  ),
  bad(
    "preview entry with an unknown key",
    "settings.lastRun.preview[0]",
    run({
      preview: [{ side: "sc", title: "t", [MARK]: 1 }],
    }),
  ),
  bad("lastFinish not an object", "settings.lastFinish", {
    mode: "live",
    lastFinish: MARK,
  }),
  bad(
    "lastFinish at fractional",
    "settings.lastFinish.at",
    finish({
      at: 0.5,
    }),
  ),
  bad(
    "lastFinish key invalid",
    "settings.lastFinish.key",
    finish({
      key: MARK,
    }),
  ),
  bad(
    "lastFinish outcome unknown",
    "settings.lastFinish.outcome",
    finish({
      outcome: MARK,
    }),
  ),
  bad(
    "lastFinish with an unknown key",
    "settings.lastFinish",
    finish({
      [MARK]: 1,
    }),
  ),
  bad(
    "a failed finish without its reason",
    "settings.lastFinish.error",
    finish({ outcome: "failed" }),
  ),
  bad(
    "a failed finish with an unknown reason",
    "settings.lastFinish.error",
    finish({ outcome: "failed", error: MARK }),
  ),
  bad(
    "a finish that did not fail, with a reason",
    "settings.lastFinish.error",
    finish({ outcome: "done", error: "sc-session" }),
  ),
  bad("finishWindow null", "settings.finishWindow", {
    mode: "live",
    finishWindow: null,
  }),
  bad("finishWindow with an unknown key", "settings.finishWindow", {
    mode: "live",
    finishWindow: { from: 0, count: 0, [MARK]: 1 },
  }),
  bad("finishWindow from negative", "settings.finishWindow.from", {
    mode: "live",
    finishWindow: { from: -1, count: 0 },
  }),
  bad("finishWindow count fractional", "settings.finishWindow.count", {
    mode: "live",
    finishWindow: { from: 0, count: 1.5 },
  }),
  bad("finishWindow count above the limit", "settings.finishWindow.count", {
    mode: "live",
    finishWindow: { from: 0, count: 31 },
  }),
  bad("finishWindow count missing", "settings.finishWindow.count", {
    mode: "live",
    finishWindow: { from: 0 },
  }),
];

describe("parseSettings rejects", () => {
  it.each(BAD_CASES)("$name", ({ raw, path }) => {
    const error = rejection(raw);
    expect(error).toBeInstanceOf(StoredStateError);
    expect((error as Error).message).toBe(`stored state: ${path}`);
    expect((error as Error).message).not.toContain(MARK);
  });
});

describe("thresholds and pauseFromPercent", () => {
  const plan3 = {
    mode: "live",
    binding: { scUsername: "x", nakaAccount: "1" },
    lastAutoRunAt: 1,
    lastRun: { at: 1, trigger: "button", mode: "live", outcome: "ok" },
    lastFinish: { at: 2, key: "movie:3", outcome: "done" },
    finishWindow: { from: 0, count: 1 },
  };

  it("the exact Plan 3 shape parses and takes the defaults", () => {
    const parsed = parseSettings(plan3);
    expect(parsed).toEqual(plan3);
    expect(thresholdsOf(parsed)).toEqual({ film: 0.9, episode: 0.8 });
    expect(pauseFromOf(parsed)).toBe(0);
  });

  it("stored thresholds on the grid parse and are read back", () => {
    const parsed = parseSettings({
      mode: "live",
      thresholds: { film: 0.95, episode: 0.85 },
      pauseFromPercent: 40,
    });
    expect(thresholdsOf(parsed)).toEqual({ film: 0.95, episode: 0.85 });
    expect(pauseFromOf(parsed)).toBe(40);
  });

  it.each([
    [{ film: 0.92, episode: 0.8 }],
    [{ film: 0.9, episode: 0.75 }],
    [{ film: 0.9 }],
    [{ film: 0.9, episode: 0.8, extra: 1 }],
    ["0.9"],
  ])("thresholds %j fail", (thresholds) => {
    expect(rejection({ mode: "live", thresholds })).toBeInstanceOf(
      StoredStateError,
    );
  });

  it.each([0, 99])("pauseFromPercent %s parses", (pauseFromPercent) => {
    expect(parseSettings({ mode: "live", pauseFromPercent })).toEqual({
      mode: "live",
      pauseFromPercent,
    });
  });

  it.each([100, 12.5, -1, "5", Number.NaN])(
    "pauseFromPercent %s fails",
    (pauseFromPercent) => {
      expect(rejection({ mode: "live", pauseFromPercent })).toBeInstanceOf(
        StoredStateError,
      );
    },
  );
});
