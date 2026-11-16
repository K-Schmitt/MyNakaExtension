import { describe, expect, it } from "vitest";
import {
  focusIdFor,
  tabAfterKey,
  tabFromHash,
} from "../src/status/status-tabs";
import { mountTabs, type TabDoc } from "../src/status/status-tabs-dom";
import { FakeElement } from "./ui-fakes";

function world(hash = "") {
  const els = new Map<string, FakeElement>();
  for (const id of [
    "tab-activite",
    "tab-reglages",
    "panel-activite",
    "panel-reglages",
  ]) {
    els.set(id, new FakeElement("div"));
  }
  const doc: TabDoc = { getElementById: (id) => els.get(id) ?? null };
  const win = { location: { hash } };
  mountTabs(doc, win);
  const el = (id: string): FakeElement => els.get(id) as FakeElement;
  return { el, win };
}

describe("tabFromHash", () => {
  it.each([
    ["", "activite"],
    ["#reglages", "reglages"],
    ["#autre", "activite"],
  ] as const)("%j gives %s", (hash, tab) => {
    expect(tabFromHash(hash)).toBe(tab);
  });
});

describe("tabAfterKey", () => {
  it("moves with the arrows, wrapping around", () => {
    expect(tabAfterKey("activite", "ArrowRight")).toBe("reglages");
    expect(tabAfterKey("reglages", "ArrowRight")).toBe("activite");
    expect(tabAfterKey("reglages", "ArrowLeft")).toBe("activite");
    expect(tabAfterKey("activite", "ArrowLeft")).toBe("reglages");
  });

  it("Home and End go to the ends", () => {
    expect(tabAfterKey("reglages", "Home")).toBe("activite");
    expect(tabAfterKey("activite", "End")).toBe("reglages");
  });

  it("ignores another key", () => {
    expect(tabAfterKey("activite", "a")).toBeUndefined();
  });
});

describe("mountTabs", () => {
  it("starts on Activité without a hash", () => {
    const { el } = world();
    expect(el("panel-activite").attributes.hidden).toBeUndefined();
    expect(el("panel-reglages").attributes.hidden).toBe("");
    expect(el("tab-activite").attributes["aria-selected"]).toBe("true");
    expect(el("tab-activite").attributes.tabindex).toBe("0");
    expect(el("tab-reglages").attributes.tabindex).toBe("-1");
  });

  it("starts on Réglages with #reglages", () => {
    const { el } = world("#reglages");
    expect(el("panel-activite").attributes.hidden).toBe("");
    expect(el("panel-reglages").attributes.hidden).toBeUndefined();
  });

  it("a click on Réglages shows its panel and sets the hash", () => {
    const { el, win } = world();
    el("tab-reglages").click(true);
    expect(el("panel-reglages").attributes.hidden).toBeUndefined();
    expect(el("panel-activite").attributes.hidden).toBe("");
    expect(el("tab-reglages").attributes["aria-selected"]).toBe("true");
    expect(el("tab-activite").attributes["aria-selected"]).toBe("false");
    expect(el("tab-reglages").attributes.tabindex).toBe("0");
    expect(el("tab-activite").attributes.tabindex).toBe("-1");
    expect(win.location.hash).toBe("#reglages");
  });

  it("an arrow moves the selection and the focus", () => {
    const { el } = world();
    expect(el("tab-activite").press("ArrowRight")).toBe(true);
    expect(el("tab-reglages").focusCount).toBe(1);
    expect(el("panel-reglages").attributes.hidden).toBeUndefined();
  });

  it("leaves another key alone", () => {
    const { el } = world();
    expect(el("tab-activite").press("a")).toBe(false);
    expect(el("panel-reglages").attributes.hidden).toBe("");
  });
});

describe("focusIdFor", () => {
  it("keeps a target that sits in the selected panel", () => {
    expect(focusIdFor("headline", "activite")).toBe("headline");
    expect(focusIdFor("reset", "reglages")).toBe("reset");
  });

  it("falls back to the selected tab when the target is in a hidden panel", () => {
    expect(focusIdFor("headline", "reglages")).toBe("tab-reglages");
    expect(focusIdFor("forget", "activite")).toBe("tab-activite");
  });
});
