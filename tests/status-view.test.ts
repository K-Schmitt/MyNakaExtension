import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JobError } from "../src/ext/job-error";
import type { FinishRecord, RunRecord } from "../src/ext/settings";
import { localFormat } from "../src/status/status-format";
import { confirmText, toStatusView } from "../src/status/status-view";
import type { StatusSnapshot } from "../src/sw/status-snapshot";

const UTC = localFormat("UTC");
const AT = Date.UTC(2026, 10, 4, 14, 5);
const COUNTS = { pendingRemovals: 0, openQuestions: 2, unlinked: 1 };

const LABELS: Record<JobError, string> = {
  "no-naka-tab": "Ouvrez ou rechargez un onglet Naka",
  "sc-session": "Reconnectez-vous sur SensCritique",
  "naka-session": "Reconnectez-vous sur Naka",
  "other-account": "Compte différent de celui enregistré",
  "stored-state": "État enregistré illisible",
  unavailable: "Site indisponible, nouvel essai au prochain passage",
  "finish-limit":
    "Trop de fins de visionnage en une heure : réessayez plus tard",
};
const CODES = Object.keys(LABELS) as JobError[];

function pairs(n: number) {
  return Array.from({ length: n }, (_, i) => ({ nakaId: i + 1, scId: i + 1 }));
}

function run(extra: Partial<RunRecord> = {}): RunRecord {
  return {
    at: AT,
    trigger: "button",
    mode: "simulation",
    outcome: "ok",
    report: {
      added: pairs(2),
      deferred: pairs(1),
      failed: pairs(0),
      alreadyDone: pairs(3),
      pendingRemovals: 0,
      unresolved: 0,
    },
    ...extra,
  };
}

function ready(snapshot: StatusSnapshot, format = UTC) {
  const view = toStatusView(snapshot, format);
  if (view.kind !== "ready") throw new Error(`not ready: ${view.kind}`);
  return view;
}

describe("toStatusView: mode", () => {
  it("labels the simulation and offers the switch to live", () => {
    const view = ready({ mode: "simulation", counts: COUNTS });
    expect(view.headline).toBe("Simulation : rien n'est écrit");
    expect(view.mode).toBe("simulation");
    expect(view.switchLabel).toBe("Activer les écritures");
  });

  it("labels live and offers the way back", () => {
    const view = ready({ mode: "live", counts: COUNTS });
    expect(view.headline).toBe("Écritures actives");
    expect(view.switchLabel).toBe("Revenir en simulation");
  });

  it("offers no switch when the settings cannot be read", () => {
    const view = ready({ error: "stored-state" });
    expect(view.mode).toBeUndefined();
    expect(view.switchLabel).toBeUndefined();
    expect(view.lines).toContain(
      "Lecture de l'état impossible : État enregistré illisible",
    );
  });
});

describe("toStatusView: error labels", () => {
  it.each(CODES)("maps %s on a run", (code) => {
    const view = ready({
      mode: "live",
      lastRun: run({ outcome: "failed", error: code }),
    });
    expect(view.lines).toContain(`Synchronisation échouée : ${LABELS[code]}`);
  });

  it.each(CODES)("maps %s on a failed finish", (code) => {
    const lastFinish: FinishRecord = {
      at: AT,
      key: "film:1",
      outcome: "failed",
      error: code,
    };
    const lines = ready({ mode: "live", lastFinish }).lines;
    const expected =
      code === "finish-limit"
        ? "Limite atteinte depuis 14:05"
        : `Dernière fin de visionnage : 04/11/2026 14:05, échec : ${LABELS[code]}`;
    expect(lines).toContain(expected);
  });

  it.each(CODES)("maps %s on a snapshot error", (code) => {
    const view = ready({ mode: "live", error: code });
    expect(view.lines).toContain(
      `Lecture de l'état impossible : ${LABELS[code]}`,
    );
  });

  it("says a run ended early when it is ok with an error", () => {
    const view = ready({
      mode: "live",
      lastRun: run({ error: "sc-session" }),
    });
    expect(view.lines).toContain(
      "Terminée, mais arrêtée en cours : Reconnectez-vous sur SensCritique",
    );
  });
});

describe("toStatusView: last run and finish", () => {
  it("shows the date, the trigger and the four counts", () => {
    const lines = ready({ mode: "live", lastRun: run() }).lines;
    expect(lines).toContain(
      "Dernière synchronisation : 04/11/2026 14:05 (bouton Resynchroniser)",
    );
    expect(lines).toContain(
      "Ajoutés : 2 · Reportés : 1 · Échecs : 0 · Déjà vus : 3",
    );
  });

  it.each([
    ["naka-ready", "ouverture de Naka"],
    ["playlist", "changement de la liste"],
    ["button", "bouton Resynchroniser"],
  ] as const)("names the trigger %s", (trigger, label) => {
    const lines = ready({ mode: "live", lastRun: run({ trigger }) }).lines;
    expect(lines).toContain(
      `Dernière synchronisation : 04/11/2026 14:05 (${label})`,
    );
  });

  it("formats dates in the zone given, the owner's local time", () => {
    const tokyo = localFormat("Asia/Tokyo");
    const lines = ready({ mode: "live", lastRun: run() }, tokyo).lines;
    expect(lines[0]).toContain("04/11/2026 23:05");
  });

  it("shows a finished viewing that did not fail", () => {
    const lastFinish: FinishRecord = { at: AT, key: "film:1", outcome: "done" };
    expect(ready({ mode: "live", lastFinish }).lines).toContain(
      "Dernière fin de visionnage : 04/11/2026 14:05, enregistrée",
    );
  });

  it("shows the questions left for a later version", () => {
    const view = ready({ mode: "live", counts: COUNTS });
    expect(view.lines).toContain(
      "Questions à traiter dans une prochaine version : 2",
    );
  });

  it("shows no run line before the first run", () => {
    expect(ready({ mode: "live", counts: COUNTS }).lines).toHaveLength(1);
  });
});

describe("toStatusView: preview", () => {
  const preview = [
    { side: "sc" as const, title: "Alien" },
    { side: "naka" as const, title: "Heat" },
  ];

  it("lists the planned titles in simulation", () => {
    const view = ready({ mode: "simulation", lastRun: run({ preview }) });
    expect(view.preview).toEqual(["Alien", "Heat"]);
    expect(view.previewCount).toBe(2);
  });

  it("hides the preview when writes are live", () => {
    const view = ready({ mode: "live", lastRun: run({ preview }) });
    expect(view.preview).toEqual([]);
    expect(view.previewCount).toBe(0);
  });

  it("carries a hostile title as plain text", () => {
    const title = "<img src=x onerror=alert(1)>";
    const view = ready({
      mode: "simulation",
      lastRun: run({ preview: [{ side: "sc", title }] }),
    });
    expect(view.preview).toEqual([title]);
  });

  it("words the confirmation with the count", () => {
    expect(confirmText(3)).toBe(
      "Activer les écritures ? 3 écriture(s) prévue(s) dans la simulation seront faites au prochain passage.",
    );
  });
});

describe("toStatusView: an untrusted answer", () => {
  const NO_ENGINE = {
    kind: "no-engine",
    message: "Le moteur ne répond pas, rouvrez cette page",
  };

  it.each([
    undefined,
    null,
    "ok",
    42,
    [],
    { mode: "paused" },
    {
      mode: "live",
      counts: { pendingRemovals: -1, openQuestions: 0, unlinked: 0 },
    },
    { mode: "live", counts: "many" },
    { mode: "live", error: "boom" },
    { mode: "live", lastRun: { at: "now" } },
    { mode: "live", lastFinish: { at: AT, key: "k", outcome: "failed" } },
    {
      mode: "live",
      lastFinish: { at: AT, key: "k", outcome: "done", error: "unavailable" },
    },
  ])("shows the silent-engine state for %j", (raw) => {
    expect(toStatusView(raw, UTC)).toEqual(NO_ENGINE);
  });

  it("never throws on a hostile getter", () => {
    const hostile = {
      get mode(): never {
        throw new Error("boom");
      },
    };
    expect(toStatusView(hostile, UTC)).toEqual(NO_ENGINE);
  });

  it("ignores unknown keys", () => {
    const view = toStatusView({ mode: "live", token: "secret" }, UTC);
    expect(view.kind).toBe("ready");
    expect(JSON.stringify(view)).not.toContain("secret");
  });
});

describe("the page source", () => {
  it("never uses innerHTML or insertAdjacentHTML", () => {
    for (const name of readdirSync("src/status")) {
      const source = readFileSync(`src/status/${name}`, "utf8");
      expect(source, name).not.toMatch(
        /innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
      );
    }
  });
});
