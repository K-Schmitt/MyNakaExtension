import { describe, expect, it } from "vitest";
import type { ToWorker } from "../src/ext/messages";
import { createController } from "../src/status/status-controller";
import { localFormat } from "../src/status/status-format";
import type { StatusView } from "../src/status/status-view";

const SIM = {
  mode: "simulation",
  lastRun: {
    at: 1,
    trigger: "button",
    mode: "simulation",
    outcome: "ok",
    preview: [
      { side: "sc", title: "A" },
      { side: "sc", title: "B" },
    ],
  },
};
const LIVE = { mode: "live" };
const RUNNING = { mode: "live", running: { kind: "sync", since: 1 } };
const PENDING = { mode: "simulation", pendingMode: "live" };

type Deferred = { resolve(v: unknown): void; reject(e: unknown): void };

// The page's timer: every armed callback with its delay; `fire` runs the ones still armed.
function fakeTimer() {
  const armed = new Map<number, { fn: () => void; ms: number }>();
  const delays: number[] = [];
  let next = 0;
  return {
    armed,
    delays,
    timer: {
      set: (fn: () => void, ms: number) => {
        next += 1;
        armed.set(next, { fn, ms });
        delays.push(ms);
        return next;
      },
      clear: (handle: unknown) => {
        armed.delete(handle as number);
      },
    },
    fire: () => {
      const due = [...armed.values()];
      armed.clear();
      for (const { fn } of due) fn();
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function setup(answers: unknown[], confirmAnswer = true) {
  const sent: ToWorker[] = [];
  const shown: StatusView[] = [];
  const busy: boolean[] = [];
  const confirms: string[] = [];
  const pending: Deferred[] = [];
  const queue = [...answers];
  const clock = fakeTimer();
  // What the page did, in order: the buttons enabled or not, and where the focus went.
  const page: string[] = [];
  const notes: string[] = [];
  const controller = createController({
    send: (message) => {
      sent.push(message);
      if (message.type !== "status") return Promise.resolve(undefined);
      const next = queue.shift();
      if (next === "hang") {
        return new Promise((resolve, reject) =>
          pending.push({ resolve, reject }),
        );
      }
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next);
    },
    confirm: (text) => {
      confirms.push(text);
      return confirmAnswer;
    },
    show: (view) => shown.push(view),
    setBusy: (b) => {
      busy.push(b);
      page.push(`busy:${b}`);
    },
    focus: (target) => page.push(`focus:${target}`),
    note: (text) => notes.push(text),
    format: localFormat("UTC"),
    timer: clock.timer,
  });
  return {
    controller,
    sent,
    shown,
    busy,
    confirms,
    pending,
    clock,
    page,
    notes,
  };
}

describe("load", () => {
  it("shows Chargement… until the answer arrives, then the view", async () => {
    const t = setup(["hang"]);
    const loading = t.controller.load();
    expect(t.shown.map((v) => v.kind)).toEqual(["loading"]);
    expect(t.shown[0]).toMatchObject({ message: "Chargement…" });
    expect(t.busy).toEqual([true]);
    t.pending[0]?.resolve(LIVE);
    await loading;
    expect(t.shown.map((v) => v.kind)).toEqual(["loading", "ready"]);
    expect(t.busy).toEqual([true, false]);
  });

  it("asks the worker for the status, with no timeout", async () => {
    const t = setup(["hang"]);
    void t.controller.load();
    await new Promise((r) => setTimeout(r, 20));
    expect(t.sent).toEqual([{ type: "status" }]);
    expect(t.shown.map((v) => v.kind)).toEqual(["loading"]);
  });

  it("shows the silent-engine state when the send rejects", async () => {
    const t = setup([new Error("port closed")]);
    await t.controller.load();
    expect(t.shown.at(-1)).toEqual({
      kind: "no-engine",
      message: "Le moteur ne répond pas, rouvrez cette page",
    });
    expect(t.busy).toEqual([true, false]);
  });

  it("shows the silent-engine state on a malformed answer", async () => {
    const t = setup([{ mode: 7 }]);
    await t.controller.load();
    expect(t.shown.at(-1)?.kind).toBe("no-engine");
  });
});

describe("resync", () => {
  it("sends resync, then asks for the status again", async () => {
    const t = setup([SIM, SIM]);
    await t.controller.load();
    await t.controller.resync();
    expect(t.sent.map((m) => m.type)).toEqual(["status", "resync", "status"]);
  });

  it("still asks for the status when the resync send rejects", async () => {
    const t = setup([SIM, SIM]);
    await t.controller.load();
    const base = t.sent.length;
    const failing = createController({
      send: (m) => {
        t.sent.push(m);
        return m.type === "resync"
          ? Promise.reject(new Error("x"))
          : Promise.resolve(SIM);
      },
      confirm: () => true,
      show: () => {},
      setBusy: () => {},
      focus: () => {},
      note: () => {},
      format: localFormat("UTC"),
      timer: fakeTimer().timer,
    });
    await failing.resync();
    expect(t.sent.slice(base).map((m) => m.type)).toEqual(["resync", "status"]);
  });

  it("ignores a click while an answer is pending", async () => {
    const t = setup(["hang"]);
    void t.controller.load();
    await t.controller.resync();
    expect(t.sent.map((m) => m.type)).toEqual(["status"]);
  });
});

describe("toggleMode", () => {
  it("asks to confirm with the preview count, then sets live and reloads", async () => {
    const t = setup([SIM, LIVE]);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.confirms).toHaveLength(1);
    expect(t.confirms[0]).toContain("reprendra les 2 titres de l'aperçu");
    expect(t.sent.slice(1)).toEqual([
      { type: "set-mode", mode: "live" },
      { type: "status" },
    ]);
  });

  it("does nothing when the owner declines", async () => {
    const t = setup([SIM], false);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.sent.map((m) => m.type)).toEqual(["status"]);
  });

  it("goes back to simulation without a confirmation", async () => {
    const t = setup([LIVE, SIM]);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.confirms).toEqual([]);
    expect(t.sent.slice(1)).toEqual([
      { type: "set-mode", mode: "simulation" },
      { type: "status" },
    ]);
  });

  it("does nothing before a ready view", async () => {
    const t = setup([new Error("x")]);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.sent.map((m) => m.type)).toEqual(["status"]);
  });

  it("does nothing when the mode is unknown", async () => {
    const t = setup([{ error: "stored-state" }]);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.confirms).toEqual([]);
    expect(t.sent.map((m) => m.type)).toEqual(["status"]);
  });

  it("does nothing while an answer is pending", async () => {
    const t = setup([SIM, "hang"]);
    await t.controller.load();
    void t.controller.load();
    await t.controller.toggleMode();
    expect(t.sent.map((m) => m.type)).toEqual(["status", "status"]);
  });
});

// Ruling 20: while a job runs or a mode change waits, the page asks again every 5 s, and only then.
describe("polling", () => {
  const statuses = (sent: ToWorker[]) =>
    sent.filter((m) => m.type === "status").length;

  it("asks again every 5 s while a job runs or a mode change waits, and stops after", async () => {
    const t = setup([RUNNING, PENDING, LIVE]);
    await t.controller.load();
    expect(t.clock.delays).toEqual([5000]);
    t.clock.fire();
    await settle();
    expect(statuses(t.sent)).toBe(2);
    expect(t.clock.delays).toEqual([5000, 5000]);
    t.clock.fire();
    await settle();
    expect(statuses(t.sent)).toBe(3);
    expect(t.clock.armed.size).toBe(0);
    expect(t.clock.delays).toHaveLength(2);
  });

  it("does not poll an answer with nothing running or pending", async () => {
    const t = setup([LIVE]);
    await t.controller.load();
    expect(t.clock.delays).toEqual([]);
  });

  it("does not poll a silent engine", async () => {
    const t = setup([new Error("port closed")]);
    await t.controller.load();
    expect(t.clock.delays).toEqual([]);
  });

  it("a poll shows no Chargement… and leaves the buttons alone", async () => {
    const t = setup([RUNNING, LIVE]);
    await t.controller.load();
    t.clock.fire();
    await settle();
    expect(t.shown.map((v) => v.kind)).toEqual(["loading", "ready", "ready"]);
    expect(t.busy).toEqual([true, false]);
  });

  it("a poll due during an action asks nothing; the action's own answer polls again", async () => {
    const t = setup([RUNNING, "hang"]);
    await t.controller.load();
    const resync = t.controller.resync();
    await settle();
    t.clock.fire();
    await settle();
    expect(statuses(t.sent)).toBe(2);
    t.pending[0]?.resolve(RUNNING);
    await resync;
    expect(t.clock.armed.size).toBe(1);
  });

  it("an older answer never replaces a newer one", async () => {
    const t = setup([RUNNING, "hang", LIVE]);
    await t.controller.load();
    t.clock.fire();
    await settle();
    expect(t.pending).toHaveLength(1);
    await t.controller.resync();
    expect(t.shown.at(-1)).toMatchObject({ mode: "live", inProgress: false });
    t.pending[0]?.resolve(RUNNING);
    await settle();
    expect(t.shown.at(-1)).toMatchObject({ mode: "live", inProgress: false });
    expect(t.clock.armed.size).toBe(0);
  });

  it("only one poll is armed at a time", async () => {
    const t = setup([RUNNING, RUNNING]);
    await t.controller.load();
    await t.controller.resync();
    expect(t.clock.armed.size).toBe(1);
  });
});

// Disabling the pressed button drops its focus: once the answer is shown and the buttons are enabled
// again, the focus goes back to it, or to the headline when that button is now hidden (Ruling 19).
describe("focus after an action", () => {
  it("returns to Resynchroniser once the buttons are enabled again", async () => {
    const t = setup([SIM, SIM]);
    await t.controller.load();
    expect(t.page).toEqual(["busy:true", "busy:false"]);
    await t.controller.resync();
    expect(t.page.slice(2)).toEqual([
      "busy:true",
      "busy:false",
      "focus:resync",
    ]);
  });

  it("returns to the switch after a mode change", async () => {
    const t = setup([LIVE, SIM]);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.page.at(-1)).toBe("focus:switch");
  });

  it("returns to the switch when the owner declines", async () => {
    const t = setup([SIM], false);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.page.slice(2)).toEqual([
      "busy:true",
      "busy:false",
      "focus:switch",
    ]);
  });

  it("goes to the headline when the switch is hidden after the answer", async () => {
    const t = setup([LIVE, new Error("port closed")]);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.shown.at(-1)?.kind).toBe("no-engine");
    expect(t.page.at(-1)).toBe("focus:headline");
  });

  it("goes to the headline when the mode becomes unknown", async () => {
    const t = setup([LIVE, { error: "stored-state" }]);
    await t.controller.load();
    await t.controller.toggleMode();
    expect(t.page.at(-1)).toBe("focus:headline");
  });

  it("a page load and a poll move no focus", async () => {
    const t = setup([RUNNING, LIVE]);
    await t.controller.load();
    t.clock.fire();
    await settle();
    expect(t.page.filter((p) => p.startsWith("focus"))).toEqual([]);
  });

  it("a click ignored while busy moves no focus", async () => {
    const t = setup(["hang"]);
    void t.controller.load();
    await t.controller.resync();
    expect(t.page).toEqual(["busy:true"]);
  });
});

const SETTINGS = {
  mode: "live",
  thresholds: { film: 0.9, episode: 0.8 },
  pauseFromPercent: 0,
};
const SAVED = {
  mode: "live",
  thresholds: { film: 0.95, episode: 0.8 },
  pauseFromPercent: 50,
};
const DRAFT = {
  film: "0.95",
  episode: "0.8",
  pauseAny: false,
  pauseText: "50",
};

describe("saveSettings", () => {
  it("sends set-settings, asks the status once, and says the settings are saved", async () => {
    const t = setup([SETTINGS, SAVED]);
    await t.controller.load();
    await t.controller.saveSettings(DRAFT);
    expect(t.sent.slice(1)).toEqual([
      {
        type: "set-settings",
        thresholds: { film: 0.95, episode: 0.8 },
        pauseFromPercent: 50,
      },
      { type: "status" },
    ]);
    expect(t.notes).toEqual(["Réglages enregistrés"]);
    expect(t.shown.map((v) => v.kind)).toEqual(["loading", "ready", "ready"]);
  });

  it("sends 0 for « À tout moment »", async () => {
    const t = setup([SETTINGS, SETTINGS]);
    await t.controller.load();
    await t.controller.saveSettings({
      ...DRAFT,
      film: "0.9",
      pauseAny: true,
      pauseText: "50",
    });
    expect(t.sent[1]).toEqual({
      type: "set-settings",
      thresholds: { film: 0.9, episode: 0.8 },
      pauseFromPercent: 0,
    });
    expect(t.notes).toEqual(["Réglages enregistrés"]);
  });

  it("claims nothing when the answer does not show the saved values", async () => {
    const t = setup([SETTINGS, SETTINGS]);
    await t.controller.load();
    await t.controller.saveSettings(DRAFT);
    expect(t.notes).toEqual([""]);
  });

  it.each([
    { name: "the pause", answer: { ...SAVED, pauseFromPercent: 0 } },
    {
      name: "the episode threshold",
      answer: { ...SAVED, thresholds: { film: 0.95, episode: 0.85 } },
    },
    {
      name: "the film threshold",
      answer: { ...SAVED, thresholds: { film: 0.9, episode: 0.8 } },
    },
  ])(
    "claims nothing when only $name differs in the answer",
    async ({ answer }) => {
      const t = setup([SETTINGS, answer]);
      await t.controller.load();
      await t.controller.saveSettings(DRAFT);
      expect(t.notes).toEqual([""]);
    },
  );

  it("claims nothing when the engine stays silent", async () => {
    const t = setup([SETTINGS, new Error("port closed")]);
    await t.controller.load();
    await t.controller.saveSettings(DRAFT);
    expect(t.notes).toEqual([""]);
  });

  it("sends nothing for an invalid pause", async () => {
    const t = setup([SETTINGS]);
    await t.controller.load();
    await t.controller.saveSettings({ ...DRAFT, pauseText: "100" });
    expect(t.sent.map((m) => m.type)).toEqual(["status"]);
    expect(t.notes).toEqual([]);
  });

  it("does nothing while an answer is pending", async () => {
    const t = setup(["hang"]);
    void t.controller.load();
    await t.controller.saveSettings(DRAFT);
    expect(t.sent.map((m) => m.type)).toEqual(["status"]);
  });
});
