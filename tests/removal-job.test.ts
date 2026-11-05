import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import type { SyncState } from "../src/core/state";
import type { AnswerRemovalMessage } from "../src/ext/question-messages";
import type { Settings } from "../src/ext/settings";
import type { TabsPort } from "../src/sw/naka-proxy";
import { answerWorld, BOUND, NOW, PAIR, type WorldOpts } from "./answer-world";
import { removal, stateWith } from "./question-fixtures";

const LIVE: Settings = { mode: "live", binding: BOUND };

// Run 5: the pair {21, 1021} is mapped and both sides listed it at the last run.
function listedAt5(over: Partial<SyncState> = {}): SyncState {
  return stateWith({
    run: 5,
    mapping: [PAIR],
    presence: {
      naka: [{ id: 21, from: 1, to: 5 }],
      sc: [{ id: 1021, from: 1, to: 5 }],
    },
    ...over,
  });
}
const withItem = (removeFrom: "naka" | "sc", over: Partial<SyncState> = {}) =>
  listedAt5({ pending: [removal(removeFrom, PAIR)], ...over });

const msg = (
  removeFrom: "naka" | "sc",
  remove: boolean,
  pair: Pair = PAIR,
): AnswerRemovalMessage => ({
  type: "answer-removal",
  removeFrom,
  nakaId: pair.nakaId,
  scId: pair.scId,
  remove,
});

function world(state: SyncState, o: WorldOpts = {}) {
  return answerWorld({ state, settings: LIVE, ...o });
}

const outcomeOf = (w: ReturnType<typeof world>) => w.settings().lastAnswer;

describe("answer-removal, removeFrom sc, remove", () => {
  it("an item, Naka without 21, SensCritique wished film: exactly one unwish(1021), question closed, done", async () => {
    const w = world(withItem("sc"));
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual(["unwish:1021"]);
    expect(w.state().pending).toEqual([]);
    expect(w.state().mapping).toEqual([PAIR]);
    expect(outcomeOf(w)).toEqual({
      seq: 1,
      at: NOW,
      target: "removal:sc:21:1021",
      outcome: "done",
    });
  });

  it("reads the Naka account first: no write is the job's first Naka call (Ruling 22)", async () => {
    const w = world(withItem("sc"));
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.traffic.sent).toEqual([
      { type: "naka-account" },
      { type: "naka-call", call: "playlistIds" },
    ]);
    expect(w.sk.calls).toEqual(["productState:1021", "unwish:1021"]);
  });

  it("SensCritique no longer wishes it: zero writes, moot, closed", async () => {
    const w = world(withItem("sc"), { product: () => ({ isWished: false }) });
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual([]);
    expect(w.state().pending).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("moot");
  });

  it("Naka has 21 again: zero writes, moot, closed, and SensCritique is not even read", async () => {
    const w = world(withItem("sc"), { playlist: () => [99, 21] });
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual([]);
    expect(w.sk.calls).toEqual([]);
    expect(w.state().pending).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("moot");
  });

  it.each([5, 32, 2])(
    "a product of universe %i: zero writes, refused, question open",
    async (universe) => {
      const before = withItem("sc");
      const w = world(before, { product: () => ({ universe }) });
      await w.jobs.answerRemoval(msg("sc", true));
      expect(w.writes()).toEqual([]);
      expect(w.state()).toEqual(before);
      expect(outcomeOf(w)?.outcome).toBe("refused");
    },
  );

  it("a wished series (universe 4) is unwished", async () => {
    const w = world(withItem("sc"), { product: () => ({ universe: 4 }) });
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual(["unwish:1021"]);
  });

  it("in simulation mode, the removal writes the same way (design §2.8)", async () => {
    const w = world(withItem("sc"), { settings: { mode: "simulation" } });
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual(["unwish:1021"]);
    expect(outcomeOf(w)?.outcome).toBe("done");
  });
});

describe("answer-removal, removeFrom naka, remove", () => {
  it("SensCritique wishes it again: moot, zero writes, closed", async () => {
    const w = world(withItem("naka"), { playlist: () => [21] });
    await w.jobs.answerRemoval(msg("naka", true));
    expect(w.writes()).toEqual([]);
    expect(w.nk.calls).toEqual([]);
    expect(w.state().pending).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("moot");
  });

  it("Naka still lists 21 and SensCritique no longer wishes it: exactly one removeFromPlaylist(21)", async () => {
    const w = world(withItem("naka"), {
      playlist: () => [21, 99],
      product: () => ({ isWished: false }),
    });
    await w.jobs.answerRemoval(msg("naka", true));
    expect(w.writes()).toEqual(["removeFromPlaylist:21"]);
    expect(w.traffic.sent).toEqual([
      { type: "naka-account" },
      { type: "naka-call", call: "playlistIds" },
      { type: "naka-call", call: "remove", contentId: 21 },
    ]);
    expect(w.state().pending).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("done");
  });

  it("Naka no longer lists 21: moot, zero writes", async () => {
    const w = world(withItem("naka"), {
      product: () => ({ isWished: false }),
    });
    await w.jobs.answerRemoval(msg("naka", true));
    expect(w.writes()).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("moot");
  });
});

describe("answer-removal with no stored item: the block right after a removal on Naka", () => {
  it("a mapped, unsettled pair listed on both sides at the last run, Naka no longer listing 21: one unwish", async () => {
    const w = world(listedAt5());
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual(["unwish:1021"]);
    expect(outcomeOf(w)?.outcome).toBe("done");
  });

  it("the snapshot does not stand for Naka's presence: refused, zero writes (Ruling 16)", async () => {
    const w = world(
      listedAt5({
        presence: { naka: [], sc: [{ id: 1021, from: 1, to: 5 }] },
        snapshot: [PAIR],
      }),
    );
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual([]);
  });

  it("Naka still lists 21: refused, zero writes, no save", async () => {
    const before = listedAt5();
    const w = world(before, { playlist: () => [21] });
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual([]);
    expect(w.sk.calls).toEqual([]);
    expect(w.stateSaves()).toBe(0);
    expect(outcomeOf(w)?.outcome).toBe("refused");
  });

  it("an unmapped pair: refused, and no Naka call at all", async () => {
    const w = world(listedAt5({ mapping: [{ nakaId: 21, scId: 1022 }] }));
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.network()).toEqual([]);
    expect(w.stateSaves()).toBe(0);
    expect(outcomeOf(w)?.outcome).toBe("refused");
  });

  it("a settled pair: refused, no network", async () => {
    const w = world(listedAt5({ settled: [PAIR] }));
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.network()).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("refused");
  });

  it("a mapped pair, SensCritique wished, Naka absent at the last run and not in the snapshot (a deferred Naka addition): refused, zero writes, no save, no network", async () => {
    const before = listedAt5({
      presence: { naka: [], sc: [{ id: 1021, from: 1, to: 5 }] },
    });
    const w = world(before);
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual([]);
    expect(w.network()).toEqual([]);
    expect(w.stateSaves()).toBe(0);
    expect(outcomeOf(w)?.outcome).toBe("refused");
  });

  it("SensCritique absent at the last run: refused, no network", async () => {
    const w = world(
      listedAt5({ presence: { naka: [{ id: 21, from: 1, to: 5 }], sc: [] } }),
    );
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.network()).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("refused");
  });

  it("removeFrom naka with no item: refused, zero writes, no network", async () => {
    const w = world(listedAt5(), {
      playlist: () => [21],
      product: () => ({ isWished: false }),
    });
    await w.jobs.answerRemoval(msg("naka", true));
    await w.jobs.answerRemoval(msg("naka", false));
    expect(outcomeOf(w)?.outcome).toBe("refused");
    expect(outcomeOf(w)?.target).toBe("removal:naka:21:1021");
    expect(w.writes()).toEqual([]);
    expect(w.network()).toEqual([]);
    expect(w.stateSaves()).toBe(0);
  });
});

describe("answer-removal, keep (« Non »)", () => {
  it("with an item: the pair settled, the question closed, zero network", async () => {
    const w = world(withItem("sc"));
    await w.jobs.answerRemoval(msg("sc", false));
    expect(w.state().settled).toEqual([PAIR]);
    expect(w.state().pending).toEqual([]);
    expect(w.network()).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("done");
  });

  it("with an item on the Naka side too", async () => {
    const w = world(withItem("naka"));
    await w.jobs.answerRemoval(msg("naka", false));
    expect(w.state().settled).toEqual([PAIR]);
    expect(w.network()).toEqual([]);
  });

  it("without an item, Naka no longer listing 21: the account and the list are read, then the pair is settled", async () => {
    const w = world(listedAt5());
    await w.jobs.answerRemoval(msg("sc", false));
    expect(w.traffic.sent).toEqual([
      { type: "naka-account" },
      { type: "naka-call", call: "playlistIds" },
    ]);
    expect(w.state().settled).toEqual([PAIR]);
    expect(w.writes()).toEqual([]);
    expect(outcomeOf(w)?.outcome).toBe("done");
  });

  it("without an item, Naka still lists 21: refused, nothing settled", async () => {
    const before = listedAt5();
    const w = world(before, { playlist: () => [21] });
    await w.jobs.answerRemoval(msg("sc", false));
    expect(w.state()).toEqual(before);
    expect(w.stateSaves()).toBe(0);
    expect(outcomeOf(w)?.outcome).toBe("refused");
  });
});

describe("an empty Naka list is a failed read, never « gone »", () => {
  const empty = { playlist: () => [] };

  it("(a) the no-item path, remove: failed with naka-list-empty, nothing written or saved", async () => {
    const before = listedAt5();
    const w = world(before, empty);
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual([]);
    expect(w.sk.calls).toEqual([]);
    expect(w.state()).toEqual(before);
    expect(w.stateSaves()).toBe(0);
    expect(outcomeOf(w)).toEqual({
      seq: 1,
      at: NOW,
      target: "removal:sc:21:1021",
      outcome: "failed",
      error: "naka-list-empty",
    });
  });

  it("(a') the no-item path, keep: failed, the pair NOT settled", async () => {
    const before = listedAt5();
    const w = world(before, empty);
    await w.jobs.answerRemoval(msg("sc", false));
    expect(w.writes()).toEqual([]);
    expect(w.state()).toEqual(before);
    expect(w.state().settled).toEqual([]);
    expect(outcomeOf(w)).toMatchObject({
      outcome: "failed",
      error: "naka-list-empty",
    });
  });

  it("(b) removeFrom sc with an item, SensCritique wished: failed, the question still open", async () => {
    const before = withItem("sc");
    const w = world(before, empty);
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual([]);
    expect(w.sk.calls).toEqual([]);
    expect(w.state()).toEqual(before);
    expect(outcomeOf(w)).toMatchObject({
      outcome: "failed",
      error: "naka-list-empty",
    });
  });

  it("(c) removeFrom naka with an item: failed with naka-list-empty, zero writes, the question still open (Ruling 15)", async () => {
    const before = withItem("naka");
    const w = world(before, {
      ...empty,
      product: () => ({ isWished: false }),
    });
    await w.jobs.answerRemoval(msg("naka", true));
    expect(w.sk.calls.filter((c) => c.startsWith("unwish"))).toEqual([]);
    expect(
      w.nk.calls.filter((c) => c.startsWith("removeFromPlaylist")),
    ).toEqual([]);
    expect(w.writes()).toEqual([]);
    expect(w.state()).toEqual(before);
    expect(w.stateSaves()).toBe(0);
    expect(outcomeOf(w)).toEqual({
      seq: 1,
      at: NOW,
      target: "removal:naka:21:1021",
      outcome: "failed",
      error: "naka-list-empty",
    });
  });
});

describe("answer-removal: the binding and the tabs", () => {
  it("checkBinding throwing other-account: zero writes, failed with other-account, question open", async () => {
    const before = withItem("sc");
    const w = world(before, { username: "intruder" });
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.writes()).toEqual([]);
    expect(w.sk.calls).toEqual([]);
    expect(w.nk.calls).toEqual([]);
    expect(w.state()).toEqual(before);
    expect(outcomeOf(w)).toMatchObject({
      outcome: "failed",
      error: "other-account",
    });
  });

  it("another Naka account: zero writes on either side", async () => {
    for (const removeFrom of ["sc", "naka"] as const) {
      const w = world(withItem(removeFrom), {
        nakaAccount: () => "88",
        playlist: () => [21],
        product: () => ({ isWished: false }),
      });
      await w.jobs.answerRemoval(msg(removeFrom, true));
      expect(w.writes()).toEqual([]);
      expect(outcomeOf(w)?.error).toBe("other-account");
    }
  });

  it("a SensCritique write that fails: failed with its code, the question open", async () => {
    const before = withItem("sc");
    const w = world(before, {
      sc: {
        unwish: async () => {
          throw new Error("HTTP 500 secret-text");
        },
      },
    });
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.state()).toEqual(before);
    expect(outcomeOf(w)).toMatchObject({
      outcome: "failed",
      error: "unavailable",
    });
    expect(JSON.stringify(w.area.data.get("settings"))).not.toContain("HTTP");
  });

  it("an unreadable state: failed with stored-state and no network", async () => {
    const w = world(listedAt5());
    w.area.data.set("state", { version: 99 });
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.network()).toEqual([]);
    expect(outcomeOf(w)?.error).toBe("stored-state");
  });

  it("Ruling 22: the first tab rejects the account read, the second is pinned, the write goes to it, and a rejected write is never tried on another tab", async () => {
    const sentTo: string[] = [];
    let writeFails = false;
    const tabs = (real: TabsPort): TabsPort => ({
      query: async () => [{ id: 11 }, { id: 12 }],
      send: async (tabId, m) => {
        const what = m.type === "naka-call" ? m.call : m.type;
        sentTo.push(`${tabId}:${what}`);
        if (tabId === 11) throw new Error("Receiving end does not exist.");
        if (writeFails && what === "remove") throw new Error("gone");
        return real.send(tabId, m);
      },
    });
    const opts = {
      tabs,
      playlist: () => [21],
      product: () => ({ isWished: false }),
    };
    const w = world(withItem("naka"), opts);
    await w.jobs.answerRemoval(msg("naka", true));
    expect(sentTo).toEqual([
      "11:naka-account",
      "12:naka-account",
      "12:playlistIds",
      "12:remove",
    ]);
    expect(w.writes()).toEqual(["removeFromPlaylist:21"]);

    sentTo.length = 0;
    writeFails = true;
    const before = withItem("naka");
    const lost = world(before, opts);
    await lost.jobs.answerRemoval(msg("naka", true));
    expect(sentTo).toEqual([
      "11:naka-account",
      "12:naka-account",
      "12:playlistIds",
      "12:remove",
    ]);
    expect(lost.writes()).toEqual([]);
    expect(lost.state()).toEqual(before);
    expect(outcomeOf(lost)).toMatchObject({
      outcome: "failed",
      error: "naka-tab-changed",
    });
  });
});

// A seeded generator, so a failure names its case.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Review Focus 1: forged answers never remove, link or finish", () => {
  const DEFERRED: Pair = { nakaId: 22, scId: 1022 };
  const start = listedAt5({
    mapping: [PAIR, DEFERRED],
    presence: {
      naka: [{ id: 21, from: 1, to: 5 }],
      sc: [
        { id: 1021, from: 1, to: 5 },
        { id: 1022, from: 4, to: 5 },
      ],
    },
    pending: [
      {
        kind: "ambiguity",
        side: "naka",
        id: 5,
        title: "Titre 5",
        candidateIds: [1005, 2005],
        candidates: [
          { id: 1005, title: "A", year: 2000, type: "film" },
          { id: 2005, title: "B", year: 2000, type: "film" },
        ],
        finish: "movie:5",
      },
    ],
  });

  type Forged = { name: string; list: number[]; run(w: World): Promise<void> };
  type World = ReturnType<typeof world>;

  function forged(r: () => number): Forged {
    const id = () => 100 + Math.floor(r() * 5000);
    const side = () => (r() < 0.5 ? ("naka" as const) : ("sc" as const));
    const remove = () => r() < 0.5;
    const kinds: (() => Forged)[] = [
      () => {
        const m = { side: side(), id: id(), choice: r() < 0.2 ? null : id() };
        return {
          name: `answer-question random ${JSON.stringify(m)}`,
          list: [99],
          run: (w) => w.jobs.answerQuestion({ type: "answer-question", ...m }),
        };
      },
      () => {
        const choice = [3005, 1006, 5, 21, id()][Math.floor(r() * 5)] ?? 1;
        return {
          name: `answer-question 5 with ${choice}`,
          list: [99],
          run: (w) =>
            w.jobs.answerQuestion({
              type: "answer-question",
              side: "naka",
              id: 5,
              choice,
            }),
        };
      },
      () => {
        const m = msg(side(), remove(), { nakaId: id(), scId: id() });
        return {
          name: `unmapped ${JSON.stringify(m)}`,
          list: [99],
          run: (w) => w.jobs.answerRemoval(m),
        };
      },
      () => {
        const m = msg("sc", remove());
        return {
          name: `still in Naka's list ${m.remove}`,
          list: [99, 21],
          run: (w) => w.jobs.answerRemoval(m),
        };
      },
      () => {
        const m = msg(side(), remove(), DEFERRED);
        return {
          name: `never listed on Naka ${JSON.stringify(m)}`,
          list: [99],
          run: (w) => w.jobs.answerRemoval(m),
        };
      },
      () => {
        const m = msg(side(), remove());
        return {
          name: `Naka list read [] ${JSON.stringify(m)}`,
          list: [],
          run: (w) => w.jobs.answerRemoval(m),
        };
      },
      () => {
        const key = `ambiguity:${side()}:${id()}`;
        return {
          name: `hide ${key}`,
          list: [99],
          run: (w) => w.jobs.hideQuestion({ type: "hide-question", key }),
        };
      },
    ];
    const pick = kinds[Math.floor(r() * kinds.length)];
    if (pick === undefined) throw new Error("no kind");
    return pick();
  }

  it("50 forged answers: zero unwish, zero removeFromPlaylist, zero markDone, the stored state unchanged", async () => {
    const r = seeded(4242);
    let list: number[] = [99];
    const w = world(start, { playlist: () => list });
    const names: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      const f = forged(r);
      names.push(f.name);
      list = f.list;
      await f.run(w);
    }
    expect(w.writes()).toEqual([]);
    expect(w.sk.calls.filter((c) => /^(unwish|markDone):/.test(c))).toEqual([]);
    expect(
      w.nk.calls.filter((c) => c.startsWith("removeFromPlaylist")),
    ).toEqual([]);
    expect(w.state()).toEqual(start);
    // Every kind of forgery was tried.
    for (const kind of [
      "answer-question random",
      "answer-question 5",
      "unmapped",
      "still in Naka's list",
      "never listed on Naka",
      "Naka list read []",
      "hide",
    ]) {
      expect(names.some((n) => n.startsWith(kind))).toBe(true);
    }
    expect(w.settings().lastAnswer?.seq).toBeGreaterThan(30);
  });
});

describe("a stale snapshot pair (fuzz seed 4312)", () => {
  it("is refused: Naka's presence ended at run 6 of 8, so the pair was not listed on both at the last run", async () => {
    const start = stateWith({
      run: 8,
      mapping: [PAIR],
      snapshot: [PAIR],
      presence: {
        naka: [{ id: 21, from: 1, to: 6 }],
        sc: [{ id: 1021, from: 7, to: 8 }],
      },
    });
    const w = world(start);
    await w.jobs.answerRemoval(msg("sc", true));
    expect(w.sk.calls.filter((c) => c.startsWith("unwish"))).toEqual([]);
    expect(w.writes()).toEqual([]);
    expect(w.settings().lastAnswer?.outcome).toBe("refused");
    expect(w.state()).toEqual(start);
  });
});
