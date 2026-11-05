import { describe, expect, it } from "vitest";
import type { SyncState } from "../src/core/state";
import type {
  LinkTitleMessage,
  RequeueQuestionMessage,
} from "../src/ext/question-messages";
import type { Settings } from "../src/ext/settings";
import { answerWorld, BOUND, NOW } from "./answer-world";
import { MARKER } from "./naka-bridge-fakes";
import { ambiguity, stateWith } from "./question-fixtures";

const LIVE: Settings = { mode: "live", binding: BOUND };
const unlinkedFilm = (): SyncState =>
  stateWith({
    unlinked: [{ side: "naka", id: 5, title: "Titre 5", reason: "no-match" }],
  });
const link = (over: Partial<LinkTitleMessage> = {}): LinkTitleMessage => ({
  type: "link-title",
  side: "naka",
  id: 5,
  otherId: 2005,
  ...over,
});
const requeue = (
  over: Partial<RequeueQuestionMessage> = {},
): RequeueQuestionMessage => ({
  type: "requeue-question",
  side: "naka",
  id: 5,
  ...over,
});
const sc = (universe: number) => ({ product: () => ({ universe }) });

describe("link-title", () => {
  it("an unlinked naka film linked to an SC universe-1 product: mapped, entry gone, done", async () => {
    const w = answerWorld({ state: unlinkedFilm(), settings: LIVE, ...sc(1) });
    await w.jobs.linkTitle(link());
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(w.state().unlinked).toEqual([]);
    expect(w.settings().lastAnswer).toEqual({
      seq: 1,
      at: NOW,
      target: "link:naka:5",
      outcome: "done",
    });
    expect(w.nk.calls).toEqual(["contentById:5"]);
    expect(w.sk.calls).toEqual(["productState:2005"]);
    expect(w.writes()).toEqual([]);
  });

  it("to an SC universe-4 product: mismatch, state unchanged, no write", async () => {
    const before = unlinkedFilm();
    const w = answerWorld({ state: before, settings: LIVE, ...sc(4) });
    await w.jobs.linkTitle(link());
    expect(w.state()).toEqual(before);
    expect(w.stateSaves()).toBe(0);
    expect(w.settings().lastAnswer).toMatchObject({
      target: "link:naka:5",
      outcome: "mismatch",
    });
    expect(w.writes()).toEqual([]);
  });

  it("the sc side: an SC film entry linked to a Naka series: mismatch", async () => {
    const state = stateWith({
      unlinked: [{ side: "sc", id: 2005, title: "T", reason: "no-match" }],
    });
    const w = answerWorld({
      state,
      ...sc(1),
      naka: {
        contentById: async (id) => ({
          contentId: id,
          tmdbId: 1,
          mediaType: "tv",
          title: "S",
        }),
      },
    });
    await w.jobs.linkTitle(link({ side: "sc", id: 2005, otherId: 5 }));
    expect(w.state()).toEqual(state);
    expect(w.settings().lastAnswer).toMatchObject({
      target: "link:sc:2005",
      outcome: "mismatch",
    });
  });

  it("a series on both sites: mapped", async () => {
    const w = answerWorld({
      state: unlinkedFilm(),
      ...sc(4),
      naka: {
        contentById: async (id) => ({
          contentId: id,
          tmdbId: 1,
          mediaType: "tv",
          title: "S",
        }),
      },
    });
    await w.jobs.linkTitle(link());
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "done" });
  });

  it("simulation mode (the default settings): the same mapping and done", async () => {
    const w = answerWorld({ state: unlinkedFilm(), ...sc(1) });
    await w.jobs.linkTitle(link());
    expect(w.settings().mode).toBe("simulation");
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "done" });
  });

  it("no unlinked entry and no question: refused with zero port calls", async () => {
    const before = stateWith({});
    const w = answerWorld({ state: before, settings: LIVE });
    await w.jobs.linkTitle(link());
    expect(w.network()).toEqual([]);
    expect(w.state()).toEqual(before);
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "refused" });
  });

  it("a product held by a settled pair: refused, before any read", async () => {
    const state = { ...unlinkedFilm(), settled: [{ nakaId: 9, scId: 2005 }] };
    const w = answerWorld({ state, settings: LIVE });
    await w.jobs.linkTitle(link());
    expect(w.network()).toEqual([]);
    expect(w.state()).toEqual(state);
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "refused" });
  });

  it("an unreadable Naka item (not in the catalogue): refused, state unchanged", async () => {
    const before = unlinkedFilm();
    const w = answerWorld({
      state: before,
      naka: { contentById: async () => undefined },
      ...sc(1),
    });
    await w.jobs.linkTitle(link());
    expect(w.state()).toEqual(before);
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "refused" });
  });

  it.each([5, 32, 7])(
    "an SC product of universe %i: refused",
    async (universe) => {
      const before = unlinkedFilm();
      const w = answerWorld({ state: before, ...sc(universe) });
      await w.jobs.linkTitle(link());
      expect(w.state()).toEqual(before);
      expect(w.settings().lastAnswer).toMatchObject({ outcome: "refused" });
    },
  );

  it("a « none » ambiguity with finish movie:5: mapped, question gone, one finish run", async () => {
    const state = stateWith({
      pending: [
        ambiguity(5, { candidateIds: [], candidates: [], finish: "movie:5" }),
      ],
    });
    const w = answerWorld({ state, settings: LIVE, ...sc(1) });
    await w.jobs.linkTitle(link());
    expect(w.state().mapping).toEqual([{ nakaId: 5, scId: 2005 }]);
    expect(w.state().pending).toEqual([]);
    expect(w.writes()).toContain("markDone:2005:2026-11-05");
    expect(w.settings().lastFinish).toMatchObject({
      key: "movie:5",
      outcome: "done",
    });
    expect(w.settings().finishWindow?.count).toBe(1);
    expect(w.settings().lastAnswer).toMatchObject({
      target: "link:naka:5",
      outcome: "done",
    });
  });

  it("a question without finish runs no finish", async () => {
    const state = stateWith({
      pending: [ambiguity(5, { candidateIds: [], candidates: [] })],
    });
    const w = answerWorld({ state, settings: LIVE, ...sc(1) });
    await w.jobs.linkTitle(link());
    expect(w.writes()).toEqual([]);
    expect(w.settings().lastFinish).toBeUndefined();
  });

  it("a mismatch with a finish waiting runs no finish", async () => {
    const state = stateWith({
      pending: [
        ambiguity(5, { candidateIds: [], candidates: [], finish: "movie:5" }),
      ],
    });
    const w = answerWorld({ state, settings: LIVE, ...sc(4) });
    await w.jobs.linkTitle(link());
    expect(w.writes()).toEqual([]);
    expect(w.state().pending).toHaveLength(1);
  });

  it("a read failure: failed with its code, no text, state unchanged", async () => {
    const before = unlinkedFilm();
    const w = answerWorld({
      state: before,
      sc: {
        productState: async () => {
          throw new Error(`HTTP 500 ${MARKER}`);
        },
      },
    });
    await w.jobs.linkTitle(link());
    expect(w.state()).toEqual(before);
    expect(w.settings().lastAnswer).toMatchObject({
      outcome: "failed",
      error: "unavailable",
    });
    expect(JSON.stringify(w.area.data.get("settings"))).not.toContain(MARKER);
  });
});

describe("requeue-question", () => {
  it("a question with candidates: refused, state unchanged", async () => {
    const before = stateWith({ pending: [ambiguity(5)] });
    const w = answerWorld({ state: before });
    await w.jobs.requeueQuestion(requeue());
    expect(w.state()).toEqual(before);
    expect(w.settings().lastAnswer).toMatchObject({
      target: "ambiguity:naka:5",
      outcome: "refused",
    });
    expect(w.network()).toEqual([]);
  });

  it("a legacy question: gone, done, recorded on the ambiguity target", async () => {
    const w = answerWorld({
      state: stateWith({ pending: [ambiguity(5, { candidates: undefined })] }),
    });
    await w.jobs.requeueQuestion(requeue());
    expect(w.state().pending).toEqual([]);
    expect(w.settings().lastAnswer).toEqual({
      seq: 1,
      at: NOW,
      target: "ambiguity:naka:5",
      outcome: "done",
    });
    expect(w.network()).toEqual([]);
  });

  it("no such question: refused", async () => {
    const w = answerWorld({ state: stateWith({}) });
    await w.jobs.requeueQuestion(requeue({ id: 99 }));
    expect(w.settings().lastAnswer).toMatchObject({ outcome: "refused" });
  });
});
