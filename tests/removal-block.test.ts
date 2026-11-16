import { describe, expect, it } from "vitest";
import { END_POLL_MS } from "../src/content/ui/end-poll";
import { createEndUi } from "../src/content/ui/end-ui";
import {
  NONE_LABEL,
  REFUSED_LINE,
  UNREACHABLE_LINE,
} from "../src/content/ui/question-copy";
import { GRACE_MS } from "../src/content/ui/rating-session";
import { createRemovalBlock } from "../src/content/ui/removal-block";
import type { WorkerPort } from "../src/content/ui/worker-port";
import type { QuestionKey } from "../src/core/questions";
import type { LastAnswer } from "../src/ext/answer-record";
import type {
  RemovalOffer,
  RemovalOfferAnswer,
} from "../src/sw/question-offers";
import { fakeClock, flush } from "./end-block-fakes";
import {
  descendants,
  FakeDoc,
  type FakeElement,
  noObserverWatch,
} from "./ui-fakes";

const NB = " ";
const OFFER: RemovalOffer = {
  kind: "removal",
  key: "removal:sc:21391:112240873",
  removeFrom: "sc",
  pair: { nakaId: 21391, scId: 112240873 },
  title: "Twin Peaks",
};
const REMOVE = "Retirer aussi de tes envies SensCritique";

function pollAt(i: number): number {
  const ms = END_POLL_MS[i];
  if (ms === undefined) throw new Error(`no re-ask ${i}`);
  return ms;
}

function lastFor(target: QuestionKey, seq: number): LastAnswer {
  return { seq, at: 0, target, outcome: "refused" };
}

function setup(first: RemovalOfferAnswer = { offer: OFFER }) {
  const clock = fakeClock();
  const doc = new FakeDoc();
  const ui = createEndUi(doc, noObserverWatch());
  const sent: unknown[][] = [];
  const asked: number[] = [];
  const script = { answer: first as RemovalOfferAnswer | undefined };
  const state = {
    free: true,
    hang: false,
    title: "Titre de Naka" as string | undefined,
  };
  const port: Pick<WorkerPort, "askRemovalOffer" | "answerRemoval"> = {
    askRemovalOffer: async (id) => {
      asked.push(id);
      return script.answer;
    },
    answerRemoval: async (...args) => {
      sent.push(args);
      return true;
    },
  };
  const block = createRemovalBlock({
    port,
    timer: clock.timer,
    now: clock.now,
    show: ui.showQuestion,
    hide: ui.hide,
    titleOf: () =>
      state.hang
        ? new Promise<string | undefined>(() => {})
        : Promise.resolve(state.title),
    ownerFree: () => state.free,
  });
  const all = (): FakeElement[] => {
    const host = doc.created.find((el) => el.shadow.children.length >= 0);
    // The stylesheet's <style> node is not content the block draws.
    return host === undefined
      ? []
      : descendants(host.shadow).filter((el) => el.tag !== "style");
  };
  const texts = (): string[] => all().map((el) => el.textContent ?? "");
  const button = (label: string): FakeElement => {
    const hit = all().find(
      (el) => el.tag === "button" && el.textContent === label,
    );
    if (hit === undefined) throw new Error(`no button ${label}`);
    return hit;
  };
  return { block, clock, sent, asked, script, state, texts, button };
}

describe("the removal block", () => {
  it("asks removal-offer once and shows the heading with the offer's title", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    expect(t.asked).toEqual([21391]);
    expect(t.block.isShown()).toBe(true);
    expect(t.texts()).toContain(
      `«${NB}Twin Peaks${NB}» a quitté Ma liste Naka.`,
    );
    expect(t.texts()).toContain(`${REMOVE}${NB}?`);
  });

  it("shows nothing when the worker offers nothing, and nothing when it does not answer", async () => {
    const t = setup({ offer: null });
    t.block.removed(21391);
    await flush();
    expect(t.block.isShown()).toBe(false);
    expect(t.texts()).toEqual([]);
    t.script.answer = undefined;
    t.block.removed(21391);
    await flush();
    expect(t.block.isShown()).toBe(false);
  });

  it("takes the title from the Naka lookup when the offer has none, then (titre inconnu)", async () => {
    const t = setup({ offer: { ...OFFER, title: "" } });
    t.block.removed(21391);
    await flush();
    expect(t.texts()).toContain(
      `«${NB}Titre de Naka${NB}» a quitté Ma liste Naka.`,
    );
    t.block.close();
    t.state.title = undefined;
    t.block.removed(21391);
    await flush();
    expect(t.texts()).toContain(
      `«${NB}(titre inconnu)${NB}» a quitté Ma liste Naka.`,
    );
  });

  it("waits 2 s at most for the title, then shows (titre inconnu)", async () => {
    const t = setup({ offer: { ...OFFER, title: "" } });
    t.state.hang = true;
    t.block.removed(21391);
    await flush();
    await t.clock.advance(1999);
    expect(t.block.isShown()).toBe(false);
    await t.clock.advance(1);
    expect(t.block.isShown()).toBe(true);
    expect(t.texts()).toContain(
      `«${NB}(titre inconnu)${NB}» a quitté Ma liste Naka.`,
    );
  });

  it("shows the offer's actions as Plus tard only", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    expect(t.button("Plus tard")).toBeDefined();
    expect(() => t.button("Fermer")).toThrow();
    expect(() => t.button("Écarter")).toThrow();
    expect(() => t.button(NONE_LABEL)).toThrow();
  });

  it("sends exactly one answer-removal remove:true on a trusted click, then locks", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    await t.clock.advance(GRACE_MS);
    const remove = t.button(REMOVE);
    remove.click(true);
    remove.click(true);
    await flush();
    expect(t.texts()).toContain("Envoi de la réponse\u2026");
    expect(t.sent).toEqual([["sc", 21391, 112240873, true]]);
  });

  it("sends remove:false for « Non »", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    await t.clock.advance(GRACE_MS);
    t.button("Non").click(true);
    await flush();
    expect(t.sent).toEqual([["sc", 21391, 112240873, false]]);
  });

  it("sends nothing for a click that is not trusted", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    await t.clock.advance(GRACE_MS);
    t.button(REMOVE).click(false);
    t.button("Non").click(false);
    await flush();
    expect(t.sent).toEqual([]);
    expect(t.block.isShown()).toBe(true);
  });

  it("hides on « Plus tard » and sends nothing", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    await t.clock.advance(GRACE_MS);
    t.button("Plus tard").click(true);
    await flush();
    expect(t.block.isShown()).toBe(false);
    expect(t.texts()).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it("does not show while another block owns the overlay, and asks once", async () => {
    const t = setup();
    t.state.free = false;
    t.block.removed(21391);
    await flush();
    expect(t.asked).toEqual([21391]);
    expect(t.block.isShown()).toBe(false);
    expect(t.texts()).toEqual([]);
  });

  it("does not show when the owner became busy while the offer was on its way", async () => {
    const t = setup();
    t.block.removed(21391);
    t.state.free = false;
    await flush();
    expect(t.block.isShown()).toBe(false);
  });

  it("close() hides it, and an offer still on its way opens nothing", async () => {
    const t = setup();
    t.block.removed(21391);
    t.block.close();
    await flush();
    expect(t.block.isShown()).toBe(false);
    t.block.removed(21391);
    await flush();
    expect(t.block.isShown()).toBe(true);
    t.block.close();
    expect(t.block.isShown()).toBe(false);
    expect(t.texts()).toEqual([]);
  });

  it("re-asks after the click, stays locked while the answer is sent, and closes once the offer is gone", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    await t.clock.advance(GRACE_MS);
    t.button(REMOVE).click(true);
    await flush();
    // Still sending wins over a newer record of the same question.
    t.script.answer = {
      offer: OFFER,
      answering: true,
      lastAnswer: lastFor(OFFER.key, 1),
    };
    await t.clock.advance(pollAt(0));
    expect(t.asked).toEqual([21391, 21391]);
    expect(t.texts()).toContain("Envoi de la réponse…");
    expect(t.texts()).not.toContain(REFUSED_LINE);
    t.script.answer = { offer: null };
    await t.clock.advance(pollAt(1));
    expect(t.asked).toEqual([21391, 21391, 21391]);
    expect(t.block.isShown()).toBe(false);
    expect(t.texts()).toEqual([]);
  });

  it("shows the refusal the worker records for this question, and unlocks", async () => {
    const t = setup({ offer: OFFER, lastAnswer: lastFor(OFFER.key, 3) });
    t.block.removed(21391);
    await flush();
    await t.clock.advance(GRACE_MS);
    t.button("Non").click(true);
    await flush();
    t.script.answer = { offer: OFFER, lastAnswer: lastFor(OFFER.key, 4) };
    await t.clock.advance(pollAt(0));
    expect(t.texts()).toContain(REFUSED_LINE);
    expect(t.button("Non")).toBeDefined();
    expect(t.sent).toHaveLength(1);
  });

  it("says the extension does not answer when every re-ask goes unanswered", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    await t.clock.advance(GRACE_MS);
    t.button(REMOVE).click(true);
    await flush();
    t.script.answer = undefined;
    for (const ms of END_POLL_MS) await t.clock.advance(ms);
    expect(t.texts()).toContain(UNREACHABLE_LINE);
    expect(t.sent).toHaveLength(1);
  });

  it("does not show a second removal over the shown one, and does not show an answering offer", async () => {
    const t = setup();
    t.block.removed(21391);
    await flush();
    t.block.removed(21391);
    await flush();
    expect(t.texts().filter((x) => x === "Non")).toHaveLength(1);
    t.block.close();
    t.script.answer = { offer: OFFER, answering: true };
    t.block.removed(21391);
    await flush();
    expect(t.block.isShown()).toBe(false);
  });
});
