// The « Réglages » section bound to the DOM: it fills the controls from the view, reads them back as a
// draft, and keeps the save button and the error line in step with what is typed. No logic of its own.

import {
  formState,
  type SettingsDraft,
  type SettingsValues,
  type SettingsView,
  sameValues,
} from "./settings-view";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`status.html: missing #${id}`);
  return found as T;
}

// What the controls were last filled with: a poll that brings the same values leaves a half-typed form alone.
let applied: SettingsValues | undefined;

export function readDraft(): SettingsDraft {
  return {
    film: element<HTMLSelectElement>("film-threshold").value,
    episode: element<HTMLSelectElement>("episode-threshold").value,
    pauseAny: element<HTMLInputElement>("pause-any").checked,
    pauseText: element<HTMLInputElement>("pause-text").value,
  };
}

// The save button and the error line follow the draft; the number box is idle under « À tout moment ».
export function syncForm(busy: boolean): void {
  const draft = readDraft();
  const state = formState(draft);
  element<HTMLInputElement>("pause-text").disabled = draft.pauseAny;
  element("pause-error").textContent = state.error ?? "";
  element<HTMLButtonElement>("save-settings").disabled = busy || !state.canSave;
}

function fillSelect(id: string, view: SettingsView, selected: string): void {
  const select = element<HTMLSelectElement>(id);
  select.replaceChildren(
    ...view.options.map((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      return item;
    }),
  );
  select.value = selected;
}

function fill(view: SettingsView): void {
  fillSelect("film-threshold", view, view.film);
  fillSelect("episode-threshold", view, view.episode);
  element<HTMLInputElement>("pause-any").checked = view.pauseAny;
  element<HTMLInputElement>("pause-from").checked = !view.pauseAny;
  element<HTMLInputElement>("pause-text").value = view.pauseText;
}

export function showSettings(
  view: SettingsView | undefined,
  busy: boolean,
): void {
  element("settings").hidden = view === undefined;
  if (view === undefined) {
    applied = undefined;
    return;
  }
  if (applied === undefined || !sameValues(applied, view.values)) fill(view);
  applied = view.values;
  syncForm(busy);
}

export function showNote(text: string): void {
  element("settings-note").textContent = text;
}
