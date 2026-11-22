import { describe, expect, it } from "vitest";
import { type DejaVuDoc, dejaVuPorts } from "../src/content/ui/deja-vu-button";

const ACTIONS = "div.nh-fiche-actions > button.nh-fiche-act";
const OFF = `${ACTIONS}[title="Marquer comme vu"]`;
const ON = `${ACTIONS}[title="Retirer des titres vus"]`;

function button() {
  return {
    clicks: 0,
    click() {
      this.clicks += 1;
    },
  };
}

/** A document that answers only the exact selectors given. */
function docOf(found: Record<string, ReturnType<typeof button>>) {
  const asked: string[] = [];
  const doc: DejaVuDoc = {
    querySelector: (selector) => {
      asked.push(selector);
      return found[selector] ?? null;
    },
    querySelectorAll: (() => []) as unknown as Document["querySelectorAll"],
  };
  return { doc, asked };
}

describe("Naka's film « Déjà vu » button", () => {
  it("reads off through « Marquer comme vu »", () => {
    expect(dejaVuPorts(docOf({ [OFF]: button() }).doc).dejaVu()).toBe(false);
  });

  it("reads on through « Retirer des titres vus »", () => {
    expect(dejaVuPorts(docOf({ [ON]: button() }).doc).dejaVu()).toBe(true);
  });

  it("reads undefined without a button", () => {
    const { doc, asked } = docOf({});
    expect(dejaVuPorts(doc).dejaVu()).toBeUndefined();
    expect(asked).toEqual([OFF, ON]);
  });

  it("clicks the lit-off button once", () => {
    const off = button();
    dejaVuPorts(docOf({ [OFF]: off }).doc).clickDejaVu();
    expect(off.clicks).toBe(1);
  });

  it("never clicks a button that is already on", () => {
    const on = button();
    dejaVuPorts(docOf({ [ON]: on }).doc).clickDejaVu();
    expect(on.clicks).toBe(0);
  });

  it("clicks nothing off screen", () => {
    expect(() => dejaVuPorts(docOf({}).doc).clickDejaVu()).not.toThrow();
  });
});
