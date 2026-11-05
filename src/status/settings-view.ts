// The « Réglages » section without the DOM: what the answer selects, what a draft allows, and what a save
// sends. The labels are written in status.html; these three sentences are shown from the code.
// French typography: U+202F before « % ».

import { THRESHOLD_CHOICES, type Thresholds } from "../core/watch-trigger";
import type { ToWorker } from "../ext/messages";

export const SETTINGS_COPY = {
  pauseFromError: "Un nombre entier de 1 à 99",
  saved: "Réglages enregistrés",
  waiting: "Réglages en attente d'enregistrement",
} as const;

// U+202F, written as a code point so that it stays visible in the source.
const NARROW_NO_BREAK_SPACE = String.fromCodePoint(0x202f);

const MIN_PAUSE = 1;
const MAX_PAUSE = 99;

export type SettingsValues = Thresholds & { pauseFromPercent: number };

export type ChoiceOption = { value: string; label: string };

export type SettingsView = {
  values: SettingsValues;
  options: ChoiceOption[];
  film: string;
  episode: string;
  pauseAny: boolean;
  pauseText: string;
};

/** What the controls hold: the choices as the DOM gives them (text), the pause as typed. */
export type SettingsDraft = {
  film: string;
  episode: string;
  pauseAny: boolean;
  pauseText: string;
};

export type FormState = { canSave: boolean; error?: string };

const percentLabel = (ratio: number): string =>
  `${Math.round(ratio * 100)}${NARROW_NO_BREAK_SPACE}%`;

const OPTIONS: ChoiceOption[] = THRESHOLD_CHOICES.map((ratio) => ({
  value: String(ratio),
  label: percentLabel(ratio),
}));

export function toSettingsView(
  thresholds: Thresholds,
  pauseFromPercent: number,
): SettingsView {
  return {
    values: { ...thresholds, pauseFromPercent },
    options: OPTIONS,
    film: String(thresholds.film),
    episode: String(thresholds.episode),
    pauseAny: pauseFromPercent === 0,
    pauseText: pauseFromPercent === 0 ? "" : String(pauseFromPercent),
  };
}

function choiceOf(text: string): number | undefined {
  return THRESHOLD_CHOICES.find((choice) => String(choice) === text);
}

// An integer from 1 to 99, written with digits only (12.5, -3, 1e1 and an empty box are refused).
function pausePercentOf(text: string): number | undefined {
  if (!/^\d{1,3}$/.test(text.trim())) return undefined;
  const percent = Number(text);
  return percent >= MIN_PAUSE && percent <= MAX_PAUSE ? percent : undefined;
}

function pauseOf(draft: SettingsDraft): number | undefined {
  return draft.pauseAny ? 0 : pausePercentOf(draft.pauseText);
}

export function formState(draft: SettingsDraft): FormState {
  if (pauseOf(draft) === undefined) {
    return { canSave: false, error: SETTINGS_COPY.pauseFromError };
  }
  const known =
    choiceOf(draft.film) !== undefined && choiceOf(draft.episode) !== undefined;
  return { canSave: known };
}

export function settingsMessage(draft: SettingsDraft): ToWorker | undefined {
  const film = choiceOf(draft.film);
  const episode = choiceOf(draft.episode);
  const pauseFromPercent = pauseOf(draft);
  if (film === undefined || episode === undefined) return undefined;
  if (pauseFromPercent === undefined) return undefined;
  return {
    type: "set-settings",
    thresholds: { film, episode },
    pauseFromPercent,
  };
}

export function sameValues(a: SettingsValues, b: SettingsValues): boolean {
  return (
    a.film === b.film &&
    a.episode === b.episode &&
    a.pauseFromPercent === b.pauseFromPercent
  );
}
