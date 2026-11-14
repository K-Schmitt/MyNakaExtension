import { describe, expect, it, vi } from "vitest";
import { createReadQueue } from "../src/content/fiche-read-queue";
import { settle } from "./fiche-controller-fakes";

/** A run whose one read waits until the test releases it. */
function heldRun() {
  let release = () => {};
  let given = false;
  const next = vi.fn(() => {
    if (given) return undefined;
    given = true;
    return () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
  });
  return { next, release: () => release() };
}

describe("the owner's ratings read one at a time", () => {
  it("starts a new run only once the read in flight has ended", async () => {
    const queue = createReadQueue();
    const first = heldRun();
    queue.run(first.next);
    await settle();
    const second = vi.fn(() => undefined);
    queue.run(second);
    await settle();
    expect(second).not.toHaveBeenCalled();
    first.release();
    await settle();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first.next).toHaveBeenCalledTimes(1);
  });

  it("reads nothing of a run cancelled before the read in flight ended", async () => {
    const queue = createReadQueue();
    const first = heldRun();
    queue.run(first.next);
    await settle();
    const second = vi.fn(() => undefined);
    queue.run(second);
    queue.cancel();
    first.release();
    await settle();
    expect(second).not.toHaveBeenCalled();
  });
});
