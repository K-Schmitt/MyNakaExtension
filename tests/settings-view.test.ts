import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formState,
  SETTINGS_COPY,
  type SettingsDraft,
  settingsMessage,
  toSettingsView,
} from "../src/status/settings-view";
import { localFormat } from "../src/status/status-format";
import { toStatusView } from "../src/status/status-view";

const NB = " ";

const DRAFT: SettingsDraft = {
  film: "0.95",
  episode: "0.8",
  pauseAny: false,
  pauseText: "50",
};

describe("toSettingsView", () => {
  it("selects 90 %, 80 % and « À tout moment » for {film 0.9, episode 0.8, pause 0}", () => {
    const view = toSettingsView({ film: 0.9, episode: 0.8 }, 0);
    expect(view.film).toBe("0.9");
    expect(view.episode).toBe("0.8");
    expect(view.pauseAny).toBe(true);
    expect(view.pauseText).toBe("");
    const label = (value: string) =>
      view.options.find((o) => o.value === value)?.label;
    expect(label(view.film)).toBe(`90${NB}%`);
    expect(label(view.episode)).toBe(`80${NB}%`);
  });

  it("offers 80, 85, 90, 95 and 99 %", () => {
    const view = toSettingsView({ film: 0.9, episode: 0.8 }, 0);
    expect(view.options.map((o) => o.label)).toEqual(
      ["80", "85", "90", "95", "99"].map((n) => `${n}${NB}%`),
    );
  });

  it("puts a pause from 40 % in the number box", () => {
    const view = toSettingsView({ film: 0.9, episode: 0.8 }, 40);
    expect(view.pauseAny).toBe(false);
    expect(view.pauseText).toBe("40");
  });

  it("a waiting change is in progress, so the page polls", () => {
    const format = localFormat("UTC");
    const base = { mode: "live" as const };
    expect(
      toStatusView({ ...base, pendingSettings: true }, format),
    ).toMatchObject({ settingsPending: true, inProgress: true });
    expect(toStatusView(base, format)).toMatchObject({
      settingsPending: false,
      inProgress: false,
    });
  });

  it("the status view carries it, and hides it without the thresholds", () => {
    const format = localFormat("UTC");
    const shown = toStatusView(
      {
        mode: "live",
        thresholds: { film: 0.95, episode: 0.85 },
        pauseFromPercent: 7,
      },
      format,
    );
    expect(shown).toMatchObject({
      settings: { film: "0.95", episode: "0.85", pauseText: "7" },
    });
    const hidden = toStatusView({ mode: "live" }, format);
    expect(hidden).not.toHaveProperty("settings");
  });
});

describe("formState", () => {
  it.each(["0", "100", "12.5", "", "-3", "abc", "1e1"])(
    "refuses %j in « À partir de »",
    (pauseText) => {
      expect(formState({ ...DRAFT, pauseText })).toEqual({
        canSave: false,
        error: "Un nombre entier de 1 à 99",
      });
    },
  );

  it.each(["1", "99", "50"])("accepts %j", (pauseText) => {
    expect(formState({ ...DRAFT, pauseText })).toEqual({ canSave: true });
  });

  it("ignores the number box under « À tout moment »", () => {
    expect(formState({ ...DRAFT, pauseAny: true, pauseText: "100" })).toEqual({
      canSave: true,
    });
  });

  it("cannot save a threshold off the grid", () => {
    expect(formState({ ...DRAFT, film: "0.5" }).canSave).toBe(false);
  });
});

describe("settingsMessage", () => {
  it("is exactly the set-settings message", () => {
    expect(settingsMessage(DRAFT)).toEqual({
      type: "set-settings",
      thresholds: { film: 0.95, episode: 0.8 },
      pauseFromPercent: 50,
    });
  });

  it("sends 0 for « À tout moment »", () => {
    expect(settingsMessage({ ...DRAFT, pauseAny: true })).toMatchObject({
      pauseFromPercent: 0,
    });
  });

  it("sends nothing for an invalid pause or a threshold off the grid", () => {
    expect(settingsMessage({ ...DRAFT, pauseText: "0" })).toBeUndefined();
    expect(settingsMessage({ ...DRAFT, pauseText: "12.5" })).toBeUndefined();
    expect(settingsMessage({ ...DRAFT, episode: "0.7" })).toBeUndefined();
  });
});

describe("copy", () => {
  it("the code's two sentences are the brief's", () => {
    expect(SETTINGS_COPY.pauseFromError).toBe("Un nombre entier de 1 à 99");
    expect(SETTINGS_COPY.saved).toBe("Réglages enregistrés");
  });

  it("the page holds the labels of the brief, with U+202F before %", () => {
    const html = readFileSync("src/status/status.html", "utf8");
    for (const label of [
      "Réglages",
      "Seuil pour les films",
      "Seuil pour les épisodes",
      "Bloc sur la pause",
      "À tout moment",
      "À partir de",
      "Enregistrer les réglages",
    ]) {
      expect(html, label).toContain(`>${label}<`);
    }
    expect(html).toContain("/>&#8239;%");
  });
});

// settings-dom reads the page through `document`: a map of plain objects stands for the controls.
type Control = Record<string, unknown> & { replaceChildren(): void };

function fakePage() {
  const controls = new Map<string, Control>();
  const fake = {
    getElementById: (id: string) => {
      if (!controls.has(id)) {
        controls.set(id, { replaceChildren() {} } as Control);
      }
      return controls.get(id);
    },
    createElement: () => ({}),
  };
  vi.stubGlobal("document", fake);
  return controls;
}

describe("the settings form while polls arrive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const OLD = toSettingsView({ film: 0.9, episode: 0.8 }, 0);
  const NEW = toSettingsView({ film: 0.95, episode: 0.85 }, 40);

  async function open() {
    vi.resetModules();
    const page = fakePage();
    const dom = await import("../src/status/settings-dom");
    dom.showSettings(OLD, false);
    return { page, dom };
  }

  it("fills the controls from the first view, and from a changed one", async () => {
    const { page, dom } = await open();
    expect(page.get("film-threshold")?.value).toBe("0.9");
    dom.showSettings(NEW, false);
    expect(page.get("film-threshold")?.value).toBe("0.95");
    expect(page.get("pause-text")?.value).toBe("40");
  });

  it("a poll during an edit keeps the typed value", async () => {
    const { page, dom } = await open();
    const typed = page.get("pause-text");
    if (typed === undefined) throw new Error("no control");
    typed.value = "7";
    dom.markEdited();
    dom.showSettings(NEW, false);
    expect(page.get("pause-text")?.value).toBe("7");
    expect(page.get("film-threshold")?.value).toBe("0.9");
  });

  it("a save clears the edit: the next changed view fills", async () => {
    const { page, dom } = await open();
    dom.markEdited();
    dom.markSaved();
    dom.showSettings(NEW, false);
    expect(page.get("film-threshold")?.value).toBe("0.95");
  });

  it("a reload (the section hidden) clears the edit too", async () => {
    const { page, dom } = await open();
    dom.markEdited();
    dom.showSettings(undefined, false);
    dom.showSettings(NEW, false);
    expect(page.get("film-threshold")?.value).toBe("0.95");
  });
});
