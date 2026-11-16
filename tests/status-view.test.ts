import { describe, expect, it } from "vitest";
import type { JobError } from "../src/ext/job-error";
import type { FinishRecord, RunRecord } from "../src/ext/settings";
import { localFormat } from "../src/status/status-format";
import { pendingRatingsLine } from "../src/status/status-lines";
import { confirmText } from "../src/status/status-mode-copy";
import {
  bindingLine,
  COUNT_ORDER,
  WAITING_LABELS,
} from "../src/status/status-owner-lines";
import { toStatusView } from "../src/status/status-view";
import type { Counts, StatusSnapshot } from "../src/sw/status-snapshot";

// French typography: U+202F before « : ; ? ! » and inside « ». Every expected string below spells it
// out by code point, so a plain space fails.
const NB = "\u202F";
const UTC = localFormat("UTC");
const AT = Date.UTC(2026, 10, 4, 14, 5);
const COUNTS = { pendingRemovals: 0, openQuestions: 2, unlinked: 1 };
const ZERO = { pendingRemovals: 0, openQuestions: 0, unlinked: 0 };

const LABELS: Record<JobError, string> = {
  "no-naka-tab": "Ouvre ou recharge un onglet Naka",
  "sc-session": "Reconnecte-toi sur SensCritique",
  "naka-session": "Reconnecte-toi sur Naka",
  "other-account": "Compte différent de celui enregistré",
  "stored-state": "État enregistré illisible",
  unavailable: "Site indisponible, nouvel essai au prochain passage",
  "finish-limit": `Trop de fins de visionnage en une heure${NB}: réessaie plus tard`,
  "naka-list-empty": `Ma liste Naka lue vide${NB}: rien n’a été retiré`,
  "naka-tab-changed": `L’onglet Naka a changé de page ou a été rechargé${NB}: la suite au prochain passage`,
  "naka-content-unknown": "Contenu inconnu de Naka ou d\u2019un autre type",
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
      unresolved: 4,
    },
    ...extra,
  };
}

const LAQ = "\u00AB";
const RAQ = "\u00BB";

function ready(snapshot: StatusSnapshot, format = UTC) {
  const view = toStatusView(snapshot, format);
  if (view.kind !== "ready") throw new Error(`not ready: ${view.kind}`);
  return view;
}

describe("toStatusView: mode", () => {
  it("simulation: the headline says so and points to Réglages, the switch is on", () => {
    const view = ready({ mode: "simulation", counts: COUNTS });
    expect(view.headline).toBe(
      `Mode simulation actif${NB}: tes listes ne sont pas modifiées. Voir Réglages.`,
    );
    expect(view.mode).toBe("simulation");
    expect(view.simulationOn).toBe(true);
  });

  it("live: the headline no longer names the mode and the switch is off", () => {
    const view = ready({ mode: "live", counts: COUNTS });
    expect(view.headline).toBe("Synchronisation active");
    expect(view.simulationOn).toBe(false);
    expect(view.preview).toEqual([]);
  });

  it("live with next: next is empty in the Activité view", () => {
    const view = ready({
      mode: "live",
      lastRun: run({
        next: [{ side: "sc", title: "Film 3", year: 2003, type: "film" }],
      }),
    });
    expect(view.next).toEqual([]);
  });

  it("simulation with next: next is listed", () => {
    const view = ready({
      mode: "simulation",
      lastRun: run({
        next: [{ side: "sc", title: "Film 3", year: 2003, type: "film" }],
      }),
    });
    expect(view.next).toHaveLength(1);
  });

  it("firstRunPending in live: the first pass adds to the lists", () => {
    const view = ready({ mode: "live", firstRunPending: true });
    expect(view.firstRunLine).toBe(
      `Premier passage${NB}: il ajoutera aux deux listes les titres qui manquent, au plus 10 écritures. Clique sur ${LAQ}${NB}Resynchroniser${NB}${RAQ} pour le lancer.`,
    );
    expect(ready({ mode: "live" }).firstRunLine).toBeUndefined();
  });

  it("firstRunPending in simulation: the first pass promises no write", () => {
    const view = ready({ mode: "simulation", firstRunPending: true });
    expect(view.firstRunLine).toBe(
      `Premier passage${NB}: il montrera dans Réglages ce qu’une synchronisation écrirait. Clique sur ${LAQ}${NB}Resynchroniser${NB}${RAQ} pour le lancer.`,
    );
  });

  it("offers no switch when the settings cannot be read", () => {
    const view = ready({ error: "stored-state" });
    expect(view.mode).toBeUndefined();
    expect(view.simulationOn).toBe(false);
    expect(view.lines).toContain(
      `Lecture de l’état impossible${NB}: État enregistré illisible`,
    );
  });
});

describe("toStatusView: error labels", () => {
  it.each(CODES)("maps %s on a run", (code) => {
    const view = ready({
      mode: "live",
      lastRun: run({ outcome: "failed", error: code }),
    });
    expect(view.lines).toContain(
      `Synchronisation échouée${NB}: ${LABELS[code]}`,
    );
  });

  it.each(CODES)("maps %s on a failed finish", (code) => {
    const lastFinish: FinishRecord = {
      at: AT,
      key: "movie:1",
      outcome: "failed",
      error: code,
    };
    const lines = ready({ mode: "live", lastFinish }).lines;
    const expected =
      code === "finish-limit"
        ? `Fins de visionnage${NB}: limite de 30 par heure atteinte le 04/11/2026 à 14:05`
        : `Dernière fin de visionnage${NB}: 04/11/2026 14:05, échec${NB}: ${LABELS[code]}`;
    expect(lines).toContain(expected);
  });

  it.each(CODES)("maps %s on a snapshot error", (code) => {
    const view = ready({ mode: "live", error: code });
    expect(view.lines).toContain(
      `Lecture de l’état impossible${NB}: ${LABELS[code]}`,
    );
  });

  it("says a run ended early when it is ok with an error", () => {
    const view = ready({
      mode: "live",
      lastRun: run({ error: "sc-session" }),
    });
    expect(view.lines).toContain(
      `Terminée, mais arrêtée en cours${NB}: Reconnecte-toi sur SensCritique`,
    );
  });

  it("dates the finish limit in the owner's local time, day included", () => {
    const tokyo = localFormat("Asia/Tokyo");
    const lastFinish: FinishRecord = {
      at: Date.UTC(2026, 10, 4, 20, 30),
      key: "movie:1",
      outcome: "failed",
      error: "finish-limit",
    };
    expect(ready({ mode: "live", lastFinish }, tokyo).lines).toContain(
      `Fins de visionnage${NB}: limite de 30 par heure atteinte le 05/11/2026 à 05:30`,
    );
  });
});

describe("toStatusView: the last run, by its own mode", () => {
  const LATER = [
    `Reportés (10 écritures au plus par passage)${NB}: 1`,
    `Déjà vus sur SensCritique${NB}: 3`,
    `Pas encore examinés${NB}: 4`,
  ];

  // Failed writes, in either mode, right after Déjà vus, and only when there are some.
  const FAILED = (n: number) =>
    `Échecs (nouvel essai au prochain passage)${NB}: ${n}`;
  const withFailures = (mode: RunRecord["mode"], n: number) =>
    run({
      mode,
      report: {
        added: pairs(2),
        deferred: pairs(1),
        failed: pairs(n),
        alreadyDone: pairs(3),
        pendingRemovals: 0,
        unresolved: 4,
      },
    });

  it.each(["live", "simulation"] as const)(
    "a %s run with failed writes counts them right after Déjà vus",
    (mode) => {
      const lines = ready({ mode, lastRun: withFailures(mode, 2) }).lines;
      const at = lines.indexOf(`Déjà vus sur SensCritique${NB}: 3`);
      expect(at).toBeGreaterThan(0);
      expect(lines[at + 1]).toBe(FAILED(2));
      expect(lines[at + 2]).toBe(`Pas encore examinés${NB}: 4`);
    },
  );

  it("one failed write is counted, none is not shown", () => {
    const one = ready({ mode: "live", lastRun: withFailures("live", 1) });
    expect(one.lines).toContain(FAILED(1));
    const none = ready({ mode: "live", lastRun: withFailures("live", 0) });
    expect(none.lines.join(" ")).not.toContain("Échecs");
  });

  it("a live run: the date, the trigger, Ajoutés and the three other counts", () => {
    const lines = ready({ mode: "live", lastRun: run({ mode: "live" }) }).lines;
    expect(lines).toContain(
      `Dernière synchronisation${NB}: 04/11/2026 14:05 (bouton Resynchroniser)`,
    );
    expect(lines).toContain(`Ajoutés${NB}: 2`);
    for (const line of LATER) expect(lines).toContain(line);
    expect(lines.join(" ")).not.toContain("Prévus");
  });

  it("a simulated run says so, and counts what it planned as Prévus", () => {
    const lines = ready({ mode: "simulation", lastRun: run() }).lines;
    expect(lines).toContain(
      `Dernière synchronisation (simulation)${NB}: 04/11/2026 14:05 (bouton Resynchroniser)`,
    );
    expect(lines).toContain(`Prévus${NB}: 2`);
    for (const line of LATER) expect(lines).toContain(line);
    expect(lines.join(" ")).not.toContain("Ajoutés");
  });

  it("a simulated run read under live mode still says (simulation) and Prévus", () => {
    const lines = ready({ mode: "live", lastRun: run() }).lines;
    expect(lines[0]).toContain(`(simulation)${NB}:`);
    expect(lines).toContain(`Prévus${NB}: 2`);
    expect(lines.join(" ")).not.toContain("Ajoutés");
  });

  it("a live run read under simulation says Ajoutés, without (simulation)", () => {
    const lines = ready({
      mode: "simulation",
      lastRun: run({ mode: "live" }),
    }).lines;
    expect(lines).toContain(`Ajoutés${NB}: 2`);
    expect(lines.join(" ")).not.toContain("(simulation)");
  });

  it.each([
    ["naka-ready", "ouverture de Naka"],
    ["playlist", "changement de la liste"],
    ["button", "bouton Resynchroniser"],
  ] as const)("names the trigger %s", (trigger, label) => {
    const lines = ready({
      mode: "live",
      lastRun: run({ mode: "live", trigger }),
    }).lines;
    expect(lines).toContain(
      `Dernière synchronisation${NB}: 04/11/2026 14:05 (${label})`,
    );
  });

  it("formats dates in the zone given, the owner's local time", () => {
    const tokyo = localFormat("Asia/Tokyo");
    const lines = ready({ mode: "live", lastRun: run() }, tokyo).lines;
    expect(lines[0]).toContain("04/11/2026 23:05");
  });

  it("a run with no report has no count line", () => {
    const lines = ready({
      mode: "live",
      lastRun: run({ report: undefined }),
    }).lines;
    expect(lines).toHaveLength(1);
  });

  it("shows a finished viewing that did not fail", () => {
    const lastFinish: FinishRecord = {
      at: AT,
      key: "movie:1",
      outcome: "done",
    };
    expect(ready({ mode: "live", lastFinish }).lines).toContain(
      `Dernière fin de visionnage${NB}: 04/11/2026 14:05, enregistrée`,
    );
  });

  it("names the finished title, the season and the episode of a series", () => {
    const lastFinish: FinishRecord = {
      at: AT,
      key: "tv:21391:S1E3",
      outcome: "done",
      title: "Un Job Mortel",
    };
    expect(ready({ mode: "live", lastFinish }).lines).toContain(
      `Dernière fin de visionnage${NB}: «${NB}Un Job Mortel${NB}», saison 1, épisode 3, 04/11/2026 14:05, enregistrée`,
    );
  });

  it("names the finished title of a film without a place", () => {
    const lastFinish: FinishRecord = {
      at: AT,
      key: "movie:12",
      outcome: "failed",
      error: "unavailable",
      title: "Alien",
    };
    expect(ready({ mode: "live", lastFinish }).lines).toContain(
      `Dernière fin de visionnage${NB}: «${NB}Alien${NB}», 04/11/2026 14:05, échec${NB}: ${LABELS.unavailable}`,
    );
  });

  it("names the title of a replayed finish whose content Naka no longer knows", () => {
    const lastFinish: FinishRecord = {
      at: AT,
      key: "movie:5",
      outcome: "failed",
      error: "naka-content-unknown",
      title: "Titre 5",
    };
    expect(ready({ mode: "live", lastFinish }).lines).toContain(
      `Dernière fin de visionnage${NB}: «${NB}Titre 5${NB}», 04/11/2026 14:05, échec${NB}: Contenu inconnu de Naka ou d\u2019un autre type`,
    );
  });

  it("shows no run line before the first run", () => {
    expect(ready({ mode: "live", counts: ZERO }).lines).toEqual([
      "Rien en attente",
    ]);
  });
});

describe("toStatusView: what waits for the owner", () => {
  const QUESTIONS = "Questions à traiter";
  const REMOVALS = "Retraits à confirmer";
  const UNLINKED = "Titres non reliés";

  it("each count above zero on its own line", () => {
    const lines = ready({
      mode: "live",
      counts: { pendingRemovals: 3, openQuestions: 2, unlinked: 1 },
    }).lines;
    expect(lines).toEqual([
      `${QUESTIONS}${NB}: 2`,
      `${REMOVALS}${NB}: 3`,
      `${UNLINKED}${NB}: 1`,
    ]);
  });

  it.each([
    [{ ...ZERO, openQuestions: 2 }, `${QUESTIONS}${NB}: 2`],
    [{ ...ZERO, pendingRemovals: 3 }, `${REMOVALS}${NB}: 3`],
    [{ ...ZERO, unlinked: 1 }, `${UNLINKED}${NB}: 1`],
  ])("only the count above zero: %j", (counts, line) => {
    expect(ready({ mode: "live", counts }).lines).toEqual([line]);
  });

  it("all three at zero: Rien en attente", () => {
    expect(ready({ mode: "live", counts: ZERO }).lines).toEqual([
      "Rien en attente",
    ]);
  });

  it("no counts (the state unreadable): neither the counts nor Rien en attente", () => {
    const lines = ready({ mode: "live", error: "stored-state" }).lines;
    expect(lines.join(" ")).not.toContain("Rien en attente");
    expect(lines).toHaveLength(1);
  });
});

describe("toStatusView: the bound accounts", () => {
  it("names both accounts", () => {
    const binding = { scUsername: "owner", nakaAccount: "77" };
    expect(ready({ mode: "live", binding }).lines).toContain(
      `Comptes liés${NB}: owner sur SensCritique, compte Naka n°\u00A077`,
    );
  });

  it("leaves out a Naka account not bound yet", () => {
    const lines = ready({
      mode: "live",
      binding: { scUsername: "owner" },
    }).lines;
    expect(lines).toContain(`Comptes liés${NB}: owner sur SensCritique`);
  });

  it("leaves out each part that is absent", () => {
    expect(bindingLine({ nakaAccount: "77" })).toBe(
      `Comptes liés${NB}: compte Naka n°\u00A077`,
    );
    expect(bindingLine({ scUsername: "owner" })).toBe(
      `Comptes liés${NB}: owner sur SensCritique`,
    );
    expect(bindingLine({})).toBeUndefined();
  });

  it("no binding: no line", () => {
    const lines = ready({ mode: "live", counts: ZERO }).lines;
    expect(lines.join(" ")).not.toContain("Comptes liés");
  });

  it("carries a hostile username as plain text", () => {
    const scUsername = "<img src=x onerror=alert(1)>";
    expect(ready({ mode: "live", binding: { scUsername } }).lines).toContain(
      `Comptes liés${NB}: ${scUsername} sur SensCritique`,
    );
  });
});

describe("toStatusView: preview", () => {
  const preview = [
    { side: "sc" as const, title: "Alien" },
    { side: "naka" as const, title: "Heat" },
  ];

  it("lists the planned titles in simulation, each with its target", () => {
    const view = ready({ mode: "simulation", lastRun: run({ preview }) });
    expect(view.preview).toEqual([
      `Envies SensCritique${NB}: Alien`,
      `Ma liste Naka${NB}: Heat`,
    ]);
    expect(view.previewCount).toBe(2);
  });

  it("names an empty title (titre inconnu)", () => {
    const view = ready({
      mode: "simulation",
      lastRun: run({ preview: [{ side: "naka", title: "" }] }),
    });
    expect(view.preview).toEqual([`Ma liste Naka${NB}: (titre inconnu)`]);
    expect(view.previewCount).toBe(1);
  });

  it("adds the year and the type of a title, only the known parts", () => {
    const view = ready({
      mode: "simulation",
      lastRun: run({
        preview: [
          { side: "sc", title: "Cowboy Bebop", year: 2021, type: "serie" },
          { side: "naka", title: "Alien", type: "film" },
          { side: "naka", title: "Dune", year: 2021 },
          { side: "naka", title: "Heat" },
        ],
      }),
    });
    expect(view.preview).toEqual([
      `Envies SensCritique${NB}: Cowboy Bebop (2021, série)`,
      `Ma liste Naka${NB}: Alien (film)`,
      `Ma liste Naka${NB}: Dune (2021)`,
      `Ma liste Naka${NB}: Heat`,
    ]);
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
    expect(view.preview).toEqual([`Envies SensCritique${NB}: ${title}`]);
  });
});

describe("toStatusView: the next pass's writes", () => {
  const next = [
    {
      side: "sc" as const,
      title: "Cowboy Bebop",
      year: 2021,
      type: "serie" as const,
    },
    { side: "naka" as const, title: "Alien", type: "film" as const },
    { side: "naka" as const, title: "" },
  ];
  const lines = [
    `Envies SensCritique${NB}: Cowboy Bebop (2021, série)`,
    `Ma liste Naka${NB}: Alien (film)`,
    `Ma liste Naka${NB}: (titre inconnu)`,
  ];

  it("hides them in live mode: the section only shows in Réglages under simulation", () => {
    expect(ready({ mode: "live", lastRun: run({ next }) }).next).toEqual([]);
  });

  it("lists them in simulation", () => {
    const view = ready({ mode: "simulation", lastRun: run({ next }) });
    expect(view.next).toEqual(lines);
  });

  it("is empty for a record without them", () => {
    expect(ready({ mode: "live", lastRun: run() }).next).toEqual([]);
    expect(ready({ mode: "live" }).next).toEqual([]);
  });
});

describe("the confirmation before going live", () => {
  const ASK = `Activer les écritures${NB}? Chaque synchronisation fera au plus 10 écritures.`;
  const NEXT = `La prochaine (bouton «${NB}Resynchroniser${NB}» ou prochaine ouverture de Naka)`;

  it("with a preview: the cap, and that the page shows the writes before each pass", () => {
    expect(confirmText(3)).toBe(
      `${ASK} ${NEXT} reprendra les 3 titres de l’aperçu, puis les suivants, que cette page montre avant chaque passage.`,
    );
  });

  // One title agrees in the singular; two and more keep « les N titres ».
  it("with one title in the preview: le titre de l’aperçu", () => {
    expect(confirmText(1)).toBe(
      `${ASK} ${NEXT} reprendra le titre de l’aperçu, puis les suivants, que cette page montre avant chaque passage.`,
    );
  });

  it("with two titles: les 2 titres de l’aperçu", () => {
    expect(confirmText(2)).toContain(
      "reprendra les 2 titres de l’aperçu, puis les suivants",
    );
  });

  it("without a preview: the cap, and where the page shows the writes", () => {
    expect(confirmText(0)).toBe(
      `${ASK} La page de l’extension montre les écritures prévues au prochain passage.`,
    );
  });
});

// The status is answered while a job runs; the page names it and asks again until it ends.
describe("toStatusView: what runs now", () => {
  it("names a running sync with the time it started, and asks to be polled", () => {
    const view = ready({ mode: "live", running: { kind: "sync", since: AT } });
    expect(view.lines).toContain("Synchronisation en cours depuis 14:05");
    expect(view.inProgress).toBe(true);
  });

  it("names a running finish", () => {
    const view = ready({
      mode: "live",
      running: { kind: "finish", since: AT },
    });
    expect(view.lines).toContain("Fin de visionnage en cours de traitement");
    expect(view.inProgress).toBe(true);
  });

  it.each([
    ["simulation", "simulation"],
    ["live", "écritures actives"],
  ] as const)("names a pending switch to %s", (pendingMode, label) => {
    const view = ready({ mode: "live", pendingMode });
    expect(view.lines).toContain(
      `Changement de mode en attente${NB}: ${label}`,
    );
    expect(view.inProgress).toBe(true);
  });

  it("an answer with nothing running or pending is not polled", () => {
    const view = ready({ mode: "live", counts: COUNTS });
    expect(view.inProgress).toBe(false);
    expect(view.lines.join(" ")).not.toContain("en cours");
  });
});

describe("toStatusView: an untrusted answer", () => {
  const NO_ENGINE = {
    kind: "no-engine",
    message: "Le moteur ne répond pas, rouvre cette page",
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
    { mode: "live", running: { kind: "rate", since: AT } },
    { mode: "live", running: { kind: "sync" } },
    { mode: "live", running: { kind: "sync", since: -1 } },
    { mode: "live", running: "sync" },
    { mode: "live", pendingMode: "paused" },
    { mode: "live", binding: { scUsername: "" } },
    { mode: "live", binding: { scUsername: 7 } },
    { mode: "live", binding: { nakaAccount: "77" } },
    { mode: "live", binding: { scUsername: "o", nakaAccount: 77 } },
    { mode: "live", binding: { scUsername: "o", token: "x" } },
    { mode: "live", lastFinish: { at: AT, key: "film:1", outcome: "done" } },
    {
      mode: "live",
      lastFinish: { at: AT, key: "movie:1", outcome: "done", note: "x" },
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

describe("toStatusView: the mode switch while a change waits", () => {
  it.each(["live", "simulation"] as const)(
    "is disabled while a switch to %s waits",
    (pendingMode) => {
      expect(ready({ mode: "live", pendingMode }).switchDisabled).toBe(true);
    },
  );

  it("is enabled with no switch waiting", () => {
    expect(ready({ mode: "live", counts: COUNTS }).switchDisabled).toBe(false);
    expect(ready({}).switchDisabled).toBe(false);
  });
});

describe("toStatusView: the local actions", () => {
  it.each([
    ["forget", "Oubli des comptes liés en attente"],
    ["reset", "Réinitialisation en attente"],
  ] as const)("names a pending %s and disables the actions", (action, line) => {
    const view = ready({ mode: "live", pendingActions: [action] });
    expect(view.lines).toContain(line);
    expect(view.actionsDisabled).toBe(true);
    expect(view.switchDisabled).toBe(true);
    expect(view.inProgress).toBe(true);
  });

  it("names both when both wait", () => {
    const view = ready({ mode: "live", pendingActions: ["forget", "reset"] });
    expect(view.lines).toContain("Oubli des comptes liés en attente");
    expect(view.lines).toContain("Réinitialisation en attente");
  });

  it("enables them with nothing waiting, and with an unreadable state", () => {
    expect(ready({ mode: "live" }).actionsDisabled).toBe(false);
    expect(ready({ error: "stored-state" }).actionsDisabled).toBe(false);
    expect(ready({ mode: "live" }).switchDisabled).toBe(false);
  });
});

describe("bindingLine: no-break space after n°", () => {
  it("holds n°, U+00A0, then the id", () => {
    const line = bindingLine({ scUsername: "a", nakaAccount: "7" }) ?? "";
    const tail = line.slice(line.indexOf("n°"));
    expect(Array.from(tail, (c) => c.codePointAt(0))).toEqual([
      0x6e, 0xb0, 0xa0, 0x37,
    ]);
  });
});

describe("the waiting-count labels", () => {
  it("name every count, in the display order", () => {
    expect([...COUNT_ORDER].sort()).toEqual(Object.keys(WAITING_LABELS).sort());
    expect(COUNT_ORDER).toEqual([
      "openQuestions",
      "pendingRemovals",
      "unlinked",
    ]);
  });

  it("refuse a Record that misses a count (type check)", () => {
    // @ts-expect-error unlinked is missing
    const incomplete: Record<keyof Counts, string> = {
      openQuestions: "a",
      pendingRemovals: "b",
    };
    expect(Object.keys(incomplete)).toHaveLength(2);
  });
});

describe("toStatusView: the ratings waiting", () => {
  it("shows the line, with zero and with some", () => {
    expect(ready({ mode: "live", pendingRatings: 0 }).lines).toEqual([
      `Notes à donner${NB}: aucune`,
    ]);
    expect(ready({ mode: "live", pendingRatings: 3 }).lines).toEqual([
      `Notes à donner${NB}: 3, dans la rangée ${LAQ}${NB}À traiter${NB}${RAQ} de l\u2019accueil de Naka`,
    ]);
  });

  it("words the two sentences exactly, by code point", () => {
    expect(pendingRatingsLine(0)).toBe("Notes \u00E0 donner\u202F: aucune");
    expect(pendingRatingsLine(3)).toBe(
      "Notes \u00E0 donner\u202F: 3, dans la rang\u00E9e \u00AB\u202F\u00C0 traiter\u202F\u00BB de l\u2019accueil de Naka",
    );
  });

  it("shows no line when the ratings were not read", () => {
    expect(ready({ mode: "live" }).lines).toEqual([]);
  });
});
