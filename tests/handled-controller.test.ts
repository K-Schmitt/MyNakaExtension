import { describe, expect, it } from "vitest";
import type { ToWorker } from "../src/ext/messages";
import { createHandledController } from "../src/status/handled-controller";
import type { HandledView } from "../src/status/handled-view";

const TITLES = {
  titles: [
    { key: "tv:5:S1E1", label: "Une série · saison 1, épisode 1" },
    { key: "movie:9", label: "Un film" },
  ],
};

function setup(answers: unknown[] = [TITLES]) {
  const cancelled: string[] = [];
  const armed: (() => void)[] = [];
  const sent: ToWorker[] = [];
  const shown: HandledView[] = [];
  const queue = [...answers];
  const controller = createHandledController({
    send: async (message) => {
      sent.push(message);
      if (message.type !== "handled-titles") return { ok: true };
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    show: (view) => shown.push(view),
    cancelled: () => cancelled.push("cancelled"),
    timer: {
      set: (fn: () => void) => armed.push(fn),
      clear: () => undefined,
    },
  });
  const tick = async () => {
    for (const fn of armed.splice(0)) fn();
    await new Promise((r) => setImmediate(r));
  };
  return { controller, sent, shown, cancelled, tick, armed };
}

describe("the handled titles controller", () => {
  it("load asks for the handled titles and shows the list", async () => {
    const t = setup();
    await t.controller.load();
    expect(t.sent).toEqual([{ type: "handled-titles" }]);
    expect(t.shown).toEqual([
      {
        kind: "list",
        heading: "Titres traités (2)",
        items: TITLES.titles,
        waiting: [],
      },
    ]);
  });

  it("a send that rejects hides the list", async () => {
    const t = setup([new Error("port closed")]);
    await t.controller.load();
    expect(t.shown).toEqual([{ kind: "none" }]);
  });

  it("a send that rejects after a good load keeps the list on screen", async () => {
    const t = setup([TITLES, new Error("worker restarting")]);
    await t.controller.load();
    await t.controller.load();
    expect(t.shown).toHaveLength(1);
    expect(t.shown[0]).toMatchObject({ kind: "list", items: TITLES.titles });
  });

  it("an answer older than the latest load is dropped", async () => {
    const answers: ((value: unknown) => void)[] = [];
    const shown: HandledView[] = [];
    const controller = createHandledController({
      send: () => new Promise((resolve) => answers.push(resolve)),
      show: (view) => shown.push(view),
    });
    const older = controller.load();
    const newer = controller.load();
    const film = { titles: [{ key: "movie:9", label: "Un film" }] };
    answers[1]?.(film);
    await newer;
    answers[0]?.(TITLES);
    await older;
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ items: film.titles });
  });

  it("forget sends one forget-handled with the ids of an episode, then shows the list without it", async () => {
    const t = setup();
    await t.controller.load();
    await t.controller.forget("tv:5:S1E1");
    expect(t.sent.slice(1)).toEqual([
      { type: "forget-handled", contentId: 5, season: 1, episode: 1 },
    ]);
    expect(t.shown.at(-1)).toEqual({
      kind: "list",
      heading: "Titres traités (1)",
      items: [TITLES.titles[1]],
      waiting: [],
    });
  });

  it("forget of a film sends the content id alone", async () => {
    const t = setup();
    await t.controller.load();
    await t.controller.forget("movie:9");
    expect(t.sent[1]).toEqual({ type: "forget-handled", contentId: 9 });
  });

  it("forgetting the last title hides the section", async () => {
    const t = setup([{ titles: [TITLES.titles[1]] }]);
    await t.controller.load();
    await t.controller.forget("movie:9");
    expect(t.shown.at(-1)).toEqual({ kind: "none" });
  });

  it("forget of a key that is not a content key, or not listed, sends nothing", async () => {
    const t = setup();
    await t.controller.load();
    await t.controller.forget("x");
    await t.controller.forget("movie:777");
    expect(t.sent).toEqual([{ type: "handled-titles" }]);
  });

  it("a second click on the same title while the first is sent sends nothing more", async () => {
    const t = setup();
    await t.controller.load();
    await Promise.all([
      t.controller.forget("movie:9"),
      t.controller.forget("movie:9"),
    ]);
    expect(t.sent.filter((m) => m.type === "forget-handled")).toHaveLength(1);
  });

  it("a send that rejects on forget does not throw", async () => {
    const sent: ToWorker[] = [];
    const shown: HandledView[] = [];
    const controller = createHandledController({
      send: async (message) => {
        sent.push(message);
        if (message.type === "forget-handled") throw new Error("closed");
        return TITLES;
      },
      show: (view) => shown.push(view),
    });
    await controller.load();
    await expect(controller.forget("movie:9")).resolves.toBeUndefined();
  });

  describe("cancel", () => {
    const WAITING = { key: "tv:5:S1E1", label: "Une série" };
    const WITH_WAITING = { titles: [TITLES.titles[1]], waiting: [WAITING] };

    it("sends one cancel-retry with the ids, then shows the list without that line", async () => {
      const t = setup([WITH_WAITING]);
      await t.controller.load();
      await t.controller.cancel("tv:5:S1E1");
      expect(t.sent.slice(1).filter((m) => m.type === "cancel-retry")).toEqual([
        { type: "cancel-retry", contentId: 5, season: 1, episode: 1 },
      ]);
      expect(t.shown.at(-1)).toEqual({
        kind: "list",
        heading: "Titres traités (1)",
        items: [TITLES.titles[1]],
        waiting: [],
      });
    });

    it("a settled cancel tells the page once; a forget does not", async () => {
      const t = setup([WITH_WAITING]);
      await t.controller.load();
      await t.controller.forget("movie:9");
      expect(t.cancelled).toEqual([]);
      await t.controller.cancel("tv:5:S1E1");
      expect(t.cancelled).toEqual(["cancelled"]);
    });

    it("tells the page only once the worker no longer reports the key as cancelling", async () => {
      const still = { ...WITH_WAITING, cancelling: ["tv:5:S1E1"] };
      const t = setup([WITH_WAITING, still, still, WITH_WAITING]);
      await t.controller.load();
      const done = t.controller.cancel("tv:5:S1E1");
      await new Promise((r) => setImmediate(r));
      expect(t.cancelled).toEqual([]);
      await t.tick();
      expect(t.cancelled).toEqual([]);
      await t.tick();
      await done;
      expect(t.cancelled).toEqual(["cancelled"]);
    });

    it("a malformed cancelling still shows the list and ends the wait", async () => {
      const malformed = { ...WITH_WAITING, cancelling: "x" };
      const t = setup([malformed, malformed]);
      await t.controller.load();
      expect(t.shown.at(-1)).toMatchObject({ kind: "list" });
      await t.controller.cancel("tv:5:S1E1");
      expect(t.cancelled).toEqual(["cancelled"]);
      expect(t.armed).toEqual([]);
    });

    it("a failed read ends the wait, with one cancelled", async () => {
      const t = setup([WITH_WAITING, new Error("closed")]);
      await t.controller.load();
      await t.controller.cancel("tv:5:S1E1");
      expect(t.cancelled).toEqual(["cancelled"]);
      expect(t.armed).toEqual([]);
    });

    it("a controller with no timer does not wait", async () => {
      const sent: ToWorker[] = [];
      const cancelled: string[] = [];
      const controller = createHandledController({
        send: async (message) => {
          sent.push(message);
          return WITH_WAITING;
        },
        show: () => undefined,
        cancelled: () => cancelled.push("cancelled"),
      });
      await controller.load();
      await controller.cancel("tv:5:S1E1");
      expect(cancelled).toEqual(["cancelled"]);
      expect(sent.filter((m) => m.type === "handled-titles")).toHaveLength(1);
    });

    it("cancelling the last line of a list with no handled title hides the section", async () => {
      const t = setup([{ titles: [], waiting: [WAITING] }]);
      await t.controller.load();
      await t.controller.cancel("tv:5:S1E1");
      expect(t.shown.at(-1)).toEqual({ kind: "none" });
    });

    it("a second click while the first is sent sends nothing more", async () => {
      const t = setup([WITH_WAITING]);
      await t.controller.load();
      await Promise.all([
        t.controller.cancel("tv:5:S1E1"),
        t.controller.cancel("tv:5:S1E1"),
      ]);
      expect(t.sent.filter((m) => m.type === "cancel-retry")).toHaveLength(1);
    });

    it("a key not waiting, or not a content key, sends nothing", async () => {
      const t = setup([WITH_WAITING]);
      await t.controller.load();
      await t.controller.cancel("movie:9");
      await t.controller.cancel("x");
      expect(t.sent).toEqual([{ type: "handled-titles" }]);
    });

    it("forgetting a handled title keeps the waiting lines", async () => {
      const t = setup([WITH_WAITING]);
      await t.controller.load();
      await t.controller.forget("movie:9");
      expect(t.shown.at(-1)).toEqual({
        kind: "list",
        heading: "Titres traités (0)",
        items: [],
        waiting: [WAITING],
      });
    });

    it("a send that rejects does not throw", async () => {
      const controller = createHandledController({
        send: async (message) => {
          if (message.type === "cancel-retry") throw new Error("closed");
          return WITH_WAITING;
        },
        show: () => undefined,
      });
      await controller.load();
      await expect(controller.cancel("tv:5:S1E1")).resolves.toBeUndefined();
    });
  });
});
