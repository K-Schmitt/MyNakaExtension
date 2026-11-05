import { describe, expect, it } from "vitest";
import type { ToWorker } from "../src/ext/messages";
import { createListsController } from "../src/status/lists-controller";
import type { ListRow, ListsView } from "../src/status/lists-view";
import { POLL_MS } from "../src/status/status-controller";
import {
  AMBIGUITY,
  LEGACY,
  LISTS,
  NB,
  REMOVAL,
  UNLINKED_NAKA,
  UNLINKED_SC,
} from "./lists-fixtures";

type Deferred = { resolve(v: unknown): void; reject(e: unknown): void };

function fakeTimer() {
  const armed = new Map<number, { fn: () => void; ms: number }>();
  let next = 0;
  return {
    armed,
    timer: {
      set: (fn: () => void, ms: number) => {
        next += 1;
        armed.set(next, { fn, ms });
        return next;
      },
      clear: (handle: unknown) => void armed.delete(handle as number),
    },
    fire: () => {
      const due = [...armed.values()];
      armed.clear();
      for (const { fn } of due) fn();
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

// `lists` is what the worker answers to page-lists now; searches wait for the test to answer them.
function setup(lists: unknown = LISTS) {
  const sent: ToWorker[] = [];
  const shown: ListsView[] = [];
  const searches: Deferred[] = [];
  const holds: Deferred[] = [];
  const t = fakeTimer();
  const world = { lists, holdActions: false, rejectActions: false };
  const controller = createListsController({
    send: (message) => {
      sent.push(message);
      if (message.type === "page-lists") return Promise.resolve(world.lists);
      if (message.type === "search-titles") {
        return new Promise((resolve, reject) =>
          searches.push({ resolve, reject }),
        );
      }
      if (world.rejectActions) return Promise.reject(new Error("closed"));
      if (!world.holdActions) return Promise.resolve({ ok: true });
      return new Promise((resolve, reject) => holds.push({ resolve, reject }));
    },
    show: (view) => shown.push(view),
    timer: t.timer,
  });
  const last = () => {
    expect(shown.length, "a view was shown").toBeGreaterThan(0);
    return shown.at(-1) as ListsView;
  };
  const rowOf = (rows: ListRow[], key: string) => {
    const found = rows.find((r) => r.key === key);
    expect(found, `row ${key}`).toBeDefined();
    return found as ListRow;
  };
  const unlinked = (key: string) => rowOf(last().unlinked, key);
  const question = (key: string) => rowOf(last().questions, key);
  const without = (type: string) => sent.filter((m) => m.type !== type);
  return {
    controller,
    sent,
    shown,
    searches,
    holds,
    world,
    last,
    unlinked,
    question,
    without,
    ...t,
  };
}

const FOUND = { id: 2005, title: "Dune", year: 2021, type: "film" };
const KEY = UNLINKED_NAKA.key;

describe("loading", () => {
  it("asks for the lists once at load and shows both sections", async () => {
    const t = setup();
    await t.controller.load();
    expect(t.sent).toEqual([{ type: "page-lists" }]);
    expect(t.last().questions).toHaveLength(3);
    expect(t.last().unlinked).toHaveLength(2);
  });

  it("an unreadable or missing answer shows no rows", async () => {
    const t = setup({ questions: "x" });
    await t.controller.load();
    expect(t.last()).toEqual({ questions: [], unlinked: [], note: "" });
  });

  it("a rejected send shows no rows", async () => {
    const t = setup();
    t.world.lists = undefined;
    await t.controller.load();
    expect(t.last().questions).toEqual([]);
  });
});

describe("answers", () => {
  it("each button sends its message, then the lists are asked again", async () => {
    const t = setup();
    await t.controller.load();
    const press = (r: ListRow, i: number) =>
      t.controller.act(r.key, r.buttons[i]?.action as never);
    await press(t.question(AMBIGUITY.key), 1);
    await press(t.question(AMBIGUITY.key), 2);
    await press(t.question(REMOVAL.key), 0);
    await press(t.question(REMOVAL.key), 1);
    await press(t.question(LEGACY.key), 0);
    expect(t.without("page-lists")).toEqual([
      { type: "answer-question", side: "naka", id: 7, choice: 71 },
      { type: "answer-question", side: "naka", id: 7, choice: null },
      {
        type: "answer-removal",
        removeFrom: "sc",
        nakaId: 3,
        scId: 30,
        remove: true,
      },
      {
        type: "answer-removal",
        removeFrom: "sc",
        nakaId: 3,
        scId: 30,
        remove: false,
      },
      { type: "requeue-question", side: "naka", id: 9 },
    ]);
    expect(t.sent.filter((m) => m.type === "page-lists")).toHaveLength(6);
  });

  it("an action on a row the lists do not hold sends nothing", async () => {
    const t = setup();
    await t.controller.load();
    await t.controller.act("ambiguity:naka:99", {
      kind: "requeue",
      side: "naka",
      id: 99,
    });
    expect(t.without("page-lists")).toEqual([]);
  });

  it("a second click on a row sends nothing while the first is on its way", async () => {
    const t = setup();
    t.world.holdActions = true;
    await t.controller.load();
    const action = t.question(LEGACY.key).buttons[0]?.action as never;
    const first = t.controller.act(LEGACY.key, action);
    await settle();
    expect(t.question(LEGACY.key).buttons).toEqual([]);
    await t.controller.act(LEGACY.key, action);
    expect(t.without("page-lists")).toHaveLength(1);
    t.holds[0]?.resolve({ ok: true });
    await first;
  });

  it("another row stays usable meanwhile", async () => {
    const t = setup();
    t.world.holdActions = true;
    await t.controller.load();
    void t.controller.act(
      LEGACY.key,
      t.question(LEGACY.key).buttons[0]?.action as never,
    );
    await settle();
    void t.controller.act(
      REMOVAL.key,
      t.question(REMOVAL.key).buttons[1]?.action as never,
    );
    await settle();
    expect(t.without("page-lists")).toHaveLength(2);
  });

  it("a send that is refused unlocks the row and says the answer did not leave", async () => {
    const t = setup();
    await t.controller.load();
    t.world.rejectActions = true;
    await t.controller.act(
      LEGACY.key,
      t.question(LEGACY.key).buttons[0]?.action as never,
    );
    expect(t.question(LEGACY.key).lines).toEqual([
      `La réponse n'est pas partie${NB}: l'extension ne répond pas.`,
    ]);
    expect(t.question(LEGACY.key).buttons).toHaveLength(1);
  });

  it("a reply that is not ok is not a sent answer", async () => {
    const t = setup();
    await t.controller.load();
    t.world.holdActions = true;
    const done = t.controller.act(
      LEGACY.key,
      t.question(LEGACY.key).buttons[0]?.action as never,
    );
    await settle();
    t.holds[0]?.resolve({ error: "no" });
    await done;
    expect(t.question(LEGACY.key).lines).toHaveLength(1);
  });
});

describe("the lock on answering", () => {
  it("locks a row whose key is in answering, polls, and stops when it is gone", async () => {
    const t = setup({ ...LISTS, answering: [LEGACY.key] });
    await t.controller.load();
    expect(t.question(LEGACY.key).lines).toEqual(["Envoi de la réponse\u2026"]);
    expect(t.question(LEGACY.key).buttons).toEqual([]);
    expect([...t.armed.values()].map((a) => a.ms)).toEqual([POLL_MS]);

    await t.controller.act(LEGACY.key, {
      kind: "requeue",
      side: "naka",
      id: 9,
    });
    expect(t.without("page-lists")).toEqual([]);

    t.world.lists = LISTS;
    t.fire();
    await settle();
    expect(t.question(LEGACY.key).buttons).toHaveLength(1);
    expect(t.armed.size).toBe(0);
  });

  it("keeps polling while a key stays in answering", async () => {
    const t = setup({ ...LISTS, answering: [LEGACY.key] });
    await t.controller.load();
    t.fire();
    await settle();
    t.fire();
    await settle();
    expect(t.sent.filter((m) => m.type === "page-lists")).toHaveLength(3);
    expect(t.armed.size).toBe(1);
    expect(t.question(LEGACY.key).buttons).toEqual([]);
  });

  it("arms no poll when nothing is answering", async () => {
    const t = setup();
    await t.controller.load();
    expect(t.armed.size).toBe(0);
  });
});

describe("the search", () => {
  async function opened() {
    const t = setup();
    await t.controller.load();
    await t.controller.act(KEY, { kind: "open-search" });
    return t;
  }

  it("opens with the title and sends the item's side with the trimmed query", async () => {
    const t = await opened();
    expect(t.unlinked(KEY).search?.query).toBe("Dune");
    t.controller.type(KEY, "  Dune 2 ");
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    expect(t.without("page-lists")).toEqual([
      { type: "search-titles", side: "naka", query: "Dune 2" },
    ]);
    expect(t.unlinked(KEY).search?.message).toBe("Recherche\u2026");
  });

  it("shows the results, and « Relier » on result 2005 sends exactly the link", async () => {
    const t = await opened();
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    t.searches[0]?.resolve({ candidates: [FOUND, { ...FOUND, id: 2006 }] });
    await settle();
    const found = t.unlinked(KEY).search?.results;
    expect(found).toHaveLength(2);
    await t.controller.act(KEY, found?.[0]?.relier.action as never);
    expect(t.without("page-lists").at(-1)).toEqual({
      type: "link-title",
      side: "naka",
      id: 5,
      otherId: 2005,
    });
    expect(
      t.without("page-lists").filter((m) => m.type === "link-title"),
    ).toHaveLength(1);
  });

  it("an sc item is searched with side sc", async () => {
    const t = setup();
    await t.controller.load();
    await t.controller.act(UNLINKED_SC.key, { kind: "open-search" });
    t.controller.type(UNLINKED_SC.key, "Alien");
    void t.controller.act(UNLINKED_SC.key, { kind: "search" });
    await settle();
    expect(t.without("page-lists")).toEqual([
      { type: "search-titles", side: "sc", query: "Alien" },
    ]);
  });

  it("an empty query is not sent and shows « Un titre à chercher »", async () => {
    const t = await opened();
    t.controller.type(KEY, "   ");
    await t.controller.act(KEY, { kind: "search" });
    expect(t.without("page-lists")).toEqual([]);
    expect(t.unlinked(KEY).search?.fieldError).toBe("Un titre à chercher");
    t.controller.type(KEY, "D");
    await t.controller.act(KEY, { kind: "open-search" });
    expect(t.unlinked(KEY).search?.fieldError).toBeUndefined();
  });

  it("two searches in a row: the first answer, arriving after the second request, is dropped", async () => {
    const t = await opened();
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    t.controller.type(KEY, "Dune Part Two");
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    expect(t.searches).toHaveLength(2);
    t.searches[0]?.resolve({ candidates: [FOUND] });
    await settle();
    expect(t.unlinked(KEY).search?.message).toBe("Recherche\u2026");
    expect(t.unlinked(KEY).search?.results).toEqual([]);
    t.searches[1]?.resolve({ candidates: [{ ...FOUND, id: 3000 }] });
    await settle();
    expect(t.unlinked(KEY).search?.results.map((r) => r.relier.action)).toEqual(
      [{ kind: "link", side: "naka", id: 5, otherId: 3000 }],
    );
  });

  it("an answer for a row no longer open is dropped", async () => {
    const t = await opened();
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    await t.controller.act(UNLINKED_SC.key, { kind: "open-search" });
    t.searches[0]?.resolve({ candidates: [FOUND] });
    await settle();
    expect(t.unlinked(KEY).search).toBeUndefined();
    expect(t.unlinked(UNLINKED_SC.key).search?.results).toEqual([]);
    expect(t.unlinked(UNLINKED_SC.key).search?.message).toBeUndefined();
  });

  it("an answer for a row gone from the lists is dropped", async () => {
    const t = await opened();
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    t.world.lists = { ...LISTS, unlinked: [UNLINKED_SC] };
    await t.controller.load();
    t.searches[0]?.resolve({ candidates: [FOUND] });
    await settle();
    expect(t.last().unlinked.every((r) => r.search === undefined)).toBe(true);
  });

  it("words a worker error, an unreadable answer and a closed port", async () => {
    const t = await opened();
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    t.searches[0]?.resolve({ error: "naka-session" });
    await settle();
    expect(t.unlinked(KEY).search?.message).toBe(
      `Recherche impossible${NB}: reconnectez-vous sur Naka.`,
    );
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    t.searches[1]?.resolve({ nonsense: 1 });
    await settle();
    expect(t.unlinked(KEY).search?.message).toBe(
      `Recherche impossible${NB}: le site ne répond pas, réessayez plus tard.`,
    );
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    t.searches[2]?.reject(new Error("closed"));
    await settle();
    expect(t.unlinked(KEY).search?.message).toContain("Recherche impossible");
  });

  it("a link closes the search and locks the row while it is sent", async () => {
    const t = await opened();
    void t.controller.act(KEY, { kind: "search" });
    await settle();
    t.searches[0]?.resolve({ candidates: [FOUND] });
    await settle();
    const relier = t.unlinked(KEY).search?.results[0]?.relier.action as never;
    t.world.holdActions = true;
    const done = t.controller.act(KEY, relier);
    await settle();
    expect(t.unlinked(KEY).buttons).toEqual([]);
    t.world.holdActions = false;
    t.holds[0]?.resolve({ ok: true });
    await done;
    expect(t.unlinked(KEY).search).toBeUndefined();
  });
});
