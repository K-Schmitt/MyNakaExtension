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
  });
  return { controller, sent, shown };
}

describe("the handled titles controller", () => {
  it("load asks for the handled titles and shows the list", async () => {
    const t = setup();
    await t.controller.load();
    expect(t.sent).toEqual([{ type: "handled-titles" }]);
    expect(t.shown).toEqual([
      { kind: "list", heading: "Titres traités (2)", items: TITLES.titles },
    ]);
  });

  it("a send that rejects hides the list", async () => {
    const t = setup([new Error("port closed")]);
    await t.controller.load();
    expect(t.shown).toEqual([{ kind: "none" }]);
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
});
