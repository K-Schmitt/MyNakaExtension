import { describe, expect, it } from "vitest";
import { createAnswerQueue } from "../src/sw/answer-queue";

type Msg = { key: string; choice: number };

function latch() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

// An enqueue that runs the jobs one at a time, after `hold` opens.
function world(hold = latch(), runWith?: (msg: Msg) => Promise<void>) {
  const ran: Msg[] = [];
  let tail: Promise<void> = hold.opened;
  const enqueue = (job: () => Promise<void>) => {
    tail = tail.then(job);
  };
  const queue = createAnswerQueue<Msg>(enqueue, async (msg) => {
    ran.push(msg);
    await runWith?.(msg);
  });
  return { queue, ran, hold, done: () => tail };
}

describe("the answer queue", () => {
  it("keeps one waiting job per key, and the latest message wins", async () => {
    const w = world();
    w.queue({ key: "ambiguity:naka:5", choice: 1 });
    w.queue({ key: "ambiguity:naka:5", choice: 2 });
    w.queue({ key: "ambiguity:naka:5", choice: 3 });
    w.queue({ key: "ambiguity:naka:6", choice: 9 });
    w.hold.open();
    await w.done();
    expect(w.ran).toEqual([
      { key: "ambiguity:naka:5", choice: 3 },
      { key: "ambiguity:naka:6", choice: 9 },
    ]);
  });

  it("lists the waiting keys, then none once they ran", async () => {
    const w = world();
    expect(w.queue.answering()).toEqual([]);
    w.queue({ key: "ambiguity:naka:5", choice: 1 });
    w.queue({ key: "removal:sc:1:101", choice: 1 });
    expect(w.queue.answering()).toEqual([
      "ambiguity:naka:5",
      "removal:sc:1:101",
    ]);
    w.hold.open();
    await w.done();
    expect(w.queue.answering()).toEqual([]);
  });

  it("keeps listing a key while its job runs, and queues a new message behind it", async () => {
    const running = latch();
    const started = latch();
    const w = world(undefined, async (msg) => {
      if (msg.choice === 1) {
        started.open();
        await running.opened;
      }
    });
    w.hold.open();
    w.queue({ key: "ambiguity:naka:5", choice: 1 });
    await started.opened;
    expect(w.queue.answering()).toEqual(["ambiguity:naka:5"]);
    w.queue({ key: "ambiguity:naka:5", choice: 2 });
    expect(w.queue.answering()).toEqual(["ambiguity:naka:5"]);
    running.open();
    await w.done();
    expect(w.ran.map((m) => m.choice)).toEqual([1, 2]);
    expect(w.queue.answering()).toEqual([]);
  });

  it("drops the key when the job throws", async () => {
    const w = world(undefined, async () => {
      throw new Error("boom");
    });
    w.hold.open();
    w.queue({ key: "ambiguity:naka:5", choice: 1 });
    await w.done().catch(() => undefined);
    expect(w.queue.answering()).toEqual([]);
  });
});
