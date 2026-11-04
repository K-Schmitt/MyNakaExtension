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

type Deferred = { resolve(v: unknown): void; reject(e: unknown): void };

function setup(answers: unknown[], confirmAnswer = true) {
  const sent: ToWorker[] = [];
  const shown: StatusView[] = [];
  const busy: boolean[] = [];
  const confirms: string[] = [];
  const pending: Deferred[] = [];
  const queue = [...answers];
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
    setBusy: (b) => busy.push(b),
    format: localFormat("UTC"),
  });
  return { controller, sent, shown, busy, confirms, pending };
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
      format: localFormat("UTC"),
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
    expect(t.confirms[0]).toContain("2 écriture(s)");
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
