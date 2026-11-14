import { describe, expect, it } from "vitest";
import {
  INFO_FAILED_LINE,
  partialUndoLine,
  REFUSED_LINES,
  RETRY_LABEL,
  UNDO_FAILED_LINES,
} from "../src/content/ui/fiche-copy";
import type { FicheInfo } from "../src/ext/fiche-answers";
import {
  FILM_PATH,
  ficheEvent,
  linked,
  settle,
} from "./fiche-controller-fakes";
import { buttonNamed, deepParts, fakeUi, texts } from "./fiche-ui-world";

const undoable = (): FicheInfo => {
  const info = linked(55, 8);
  return { ...info, product: { ...info.product, canUndo: true } } as FicheInfo;
};

const PARTIAL = {
  partial: { done: [{ kind: "undone" }], failed: { kind: "wish" } },
  maListe: "none",
  error: "sc-session",
};

/** A film offering « Annuler », clicked, answered so, then the panel's read again lost. */
async function undoneThenLost(answer: unknown) {
  const t = fakeUi(FILM_PATH);
  t.controller.event(ficheEvent());
  t.ofType("fiche-info")[0]?.answer(undoable());
  await settle();
  t.controller.undo();
  t.ofType("fiche-undo")[0]?.answer(answer);
  await settle();
  t.ofType("fiche-info")[1]?.answer(undefined);
  await settle();
  const parts = () => deepParts(t.kept.actions()?.shadow ?? t.kept.aside);
  return { ...t, parts, retry: () => buttonNamed(parts(), RETRY_LABEL) };
}

describe("an undo's line through a lost read of the panel (spec §4)", () => {
  it.each([
    ["a partial undo", PARTIAL, partialUndoLine("wish")],
    ["a refused undo", { refused: "expired" }, REFUSED_LINES.expired],
    ["a lost undo", undefined, UNDO_FAILED_LINES.undo],
  ] as const)(
    "%s keeps its line next to the read failure, and « Réessayer » is offered",
    async (_n, answer, line) => {
      // Act
      const t = await undoneThenLost(answer);

      // Assert
      expect(texts(t.parts())).toEqual([INFO_FAILED_LINE, RETRY_LABEL, line]);
    },
  );

  it("a partial undo's line stays while « Réessayer » reads, and after its answer", async () => {
    // Arrange
    const t = await undoneThenLost(PARTIAL);

    // Act
    t.retry()?.click(true);
    const reading = texts(t.parts());
    t.ofType("fiche-info")[2]?.answer(linked(55, 3));
    await settle();

    // Assert
    expect(reading).toContain(partialUndoLine("wish"));
    expect(texts(t.parts())).toContain(partialUndoLine("wish"));
    expect(texts(t.parts())).not.toContain(INFO_FAILED_LINE);
    expect(t.retry()).toBeUndefined();
  });
});
