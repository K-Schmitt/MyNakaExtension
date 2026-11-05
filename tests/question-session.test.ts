import { describe, expect, it, vi } from "vitest";
import {
  MISMATCH_LINE,
  MOOT_LINE,
  notSentLine,
  REFUSED_LINE,
  SENDING_LINE,
  UNREACHABLE_LINE,
} from "../src/content/ui/question-copy";
import type { QuestionHandlers } from "../src/content/ui/question-render";
import {
  createQuestionSession,
  type QuestionPorts,
  type QuestionState,
} from "../src/content/ui/question-session";
import type { QuestionView } from "../src/content/ui/question-view";
import { GRACE_MS } from "../src/content/ui/rating-session";
import type { LastAnswer } from "../src/ext/question-offer-schema";
import type { AmbiguityOffer } from "../src/sw/question-offers";
import { fakeClock, flush } from "./end-block-fakes";

const KEY = "ambiguity:naka:3";
const OFFER: AmbiguityOffer = {
  kind: "ambiguity",
  key: KEY,
  side: "naka",
  id: 3,
  title: "Dune",
  candidates: [
    { id: 30, title: "Dune", year: 2021, type: "film" },
    { id: 31, title: "Dune", type: "serie" },
  ],
};
const SEQ = 7;
const CHOICE = { kind: "candidate", id: 30 } as const;

const last = (over: Partial<LastAnswer> = {}): LastAnswer => ({
  seq: SEQ + 1,
  at: 1,
  target: KEY,
  outcome: "done",
  ...over,
});

function setup(options?: { absentIsDone?: boolean }) {
  const clock = fakeClock();
  const shown: { view: QuestionView; h: QuestionHandlers }[] = [];
  let hidden = 0;
  const closed: string[] = [];
  const script: { states: (QuestionState | undefined)[]; reject: boolean } = {
    states: [{ present: true, sending: false }],
    reject: false,
  };
  const fail = { send: false };
  const ports: QuestionPorts = {
    timer: clock.timer,
    now: clock.now,
    show: (view, h) => {
      shown.push({ view, h });
    },
    hide: () => {
      hidden++;
    },
    ask: vi.fn(async () => {
      if (script.reject) throw new Error("rejected");
      return script.states.length > 1
        ? script.states.shift()
        : script.states[0];
    }),
    send: vi.fn(async () => {
      if (fail.send) throw new Error("send rejected");
      return true;
    }),
    dismiss: vi.fn(async () => true),
  };
  const session = createQuestionSession(
    ports,
    (how) => closed.push(how),
    options,
  );
  session.open(OFFER, ["plus-tard", "fermer"], SEQ);
  const top = () =>
    shown[shown.length - 1] as { view: QuestionView; h: QuestionHandlers };
  return {
    clock,
    shown,
    top,
    closed,
    script,
    fail,
    ports,
    session,
    hidden: () => hidden,
  };
}

describe("the question session grace", () => {
  it("ignores a click at 399 ms and takes one at 400 ms", async () => {
    const t = setup();
    await t.clock.advance(GRACE_MS - 1);
    t.top().h.onChoose(CHOICE);
    expect(t.ports.send).not.toHaveBeenCalled();
    await t.clock.advance(1);
    t.top().h.onChoose(CHOICE);
    expect(t.ports.send).toHaveBeenCalledWith(CHOICE);
  });

  it("locks on the sending line with no buttons, and a second click sends nothing", async () => {
    const t = setup();
    await t.clock.advance(GRACE_MS);
    t.top().h.onChoose(CHOICE);
    expect(t.top().view.sending).toBe(true);
    expect(t.top().view.notice).toBe(SENDING_LINE);
    expect(t.top().view.choices).toEqual([]);
    expect(t.top().view.actions).toEqual([]);
    t.top().h.onChoose(CHOICE);
    expect(t.ports.send).toHaveBeenCalledTimes(1);
  });
});

describe("the question session wait", () => {
  async function chosen(t: ReturnType<typeof setup>) {
    await t.clock.advance(GRACE_MS);
    t.top().h.onChoose(CHOICE);
  }

  it("keeps waiting while sending at 2, 5, 10 and 20 s, then closes answered when absent at 40 s", async () => {
    const t = setup();
    t.script.states = [
      { present: true, sending: true },
      { present: true, sending: true },
      { present: true, sending: true },
      { present: true, sending: true },
      { present: false, sending: false },
    ];
    await chosen(t);
    await t.clock.advance(2000);
    await t.clock.advance(3000);
    await t.clock.advance(5000);
    await t.clock.advance(10000);
    expect(t.closed).toEqual([]);
    expect(t.ports.ask).toHaveBeenCalledTimes(4);
    await t.clock.advance(20000);
    expect(t.closed).toEqual(["answered"]);
    expect(t.hidden()).toBe(1);
  });

  it("hides with no line when still present and sending through 40 s", async () => {
    const t = setup();
    t.script.states = [{ present: true, sending: true }];
    await chosen(t);
    const before = t.shown.length;
    await t.clock.advance(40000);
    expect(t.hidden()).toBe(1);
    expect(t.shown.length).toBe(before);
  });

  it("closes answered when a done answer for this key is newer than open", async () => {
    const t = setup();
    t.script.states = [{ present: true, sending: false, last: last() }];
    await chosen(t);
    await t.clock.advance(2000);
    expect(t.closed).toEqual(["answered"]);
  });

  it("shows the refused line and gives the choices back", async () => {
    const t = setup();
    t.script.states = [
      { present: true, sending: false, last: last({ outcome: "refused" }) },
    ];
    await chosen(t);
    await t.clock.advance(2000);
    expect(t.top().view.error).toBe(REFUSED_LINE);
    expect(t.top().view.sending).toBeUndefined();
    expect(t.top().view.choices.length).toBe(3);
    expect(t.closed).toEqual([]);
  });

  it("shows the matching line of a failed and of a mismatch answer", async () => {
    const f = setup();
    f.script.states = [
      {
        present: true,
        sending: false,
        last: last({ outcome: "failed", error: "sc-session" }),
      },
    ];
    await chosen(f);
    await f.clock.advance(2000);
    expect(f.top().view.error).toBe(notSentLine("sc-session"));
    const m = setup();
    m.script.states = [
      { present: true, sending: false, last: last({ outcome: "mismatch" }) },
    ];
    await chosen(m);
    await m.clock.advance(2000);
    expect(m.top().view.error).toBe(MISMATCH_LINE);
    expect(m.top().view.choices.length).toBe(3);
  });

  it("shows the notice and Fermer only on moot, present", async () => {
    const t = setup();
    t.script.states = [
      { present: true, sending: false, last: last({ outcome: "moot" }) },
    ];
    await chosen(t);
    await t.clock.advance(2000);
    expect(t.top().view.notice).toBe(MOOT_LINE);
    expect(t.top().view.choices).toEqual([]);
    expect(t.top().view.actions).toEqual(["fermer"]);
    expect(t.closed).toEqual([]);
  });

  it("shows the notice and Fermer only on moot even when the question is absent", async () => {
    const t = setup();
    t.script.states = [
      { present: false, sending: false, last: last({ outcome: "moot" }) },
    ];
    await chosen(t);
    await t.clock.advance(2000);
    expect(t.closed).toEqual([]);
    expect(t.top().view.notice).toBe(MOOT_LINE);
    expect(t.top().view.actions).toEqual(["fermer"]);
    t.top().h.onAction("fermer");
    expect(t.closed).toEqual([]);
    await t.clock.advance(GRACE_MS);
    t.top().h.onAction("fermer");
    expect(t.closed).toEqual(["closed"]);
  });

  it("ignores a last of another key or with a seq not greater than open", async () => {
    const other = setup();
    other.script.states = [
      {
        present: true,
        sending: false,
        last: last({ target: "ambiguity:naka:4", outcome: "refused" }),
      },
    ];
    await chosen(other);
    await other.clock.advance(2000);
    expect(other.top().view.sending).toBe(true);
    const old = setup();
    old.script.states = [
      {
        present: true,
        sending: false,
        last: last({ seq: SEQ, outcome: "refused" }),
      },
    ];
    await chosen(old);
    await old.clock.advance(2000);
    expect(old.top().view.sending).toBe(true);
  });

  it("closes answered when the question is gone and no answer names it", async () => {
    const t = setup();
    t.script.states = [{ present: false, sending: false }];
    await chosen(t);
    await t.clock.advance(2000);
    expect(t.closed).toEqual(["answered"]);
  });

  it("counts the re-asks from the click", async () => {
    const t = setup();
    await t.clock.advance(1000);
    t.top().h.onChoose(CHOICE);
    await t.clock.advance(1999);
    expect(t.ports.ask).not.toHaveBeenCalled();
    await t.clock.advance(1);
    expect(t.ports.ask).toHaveBeenCalledTimes(1);
  });
});

describe("the question session failures", () => {
  it("shows the unreachable line when the send rejects", async () => {
    const t = setup();
    t.fail.send = true;
    await t.clock.advance(GRACE_MS);
    t.top().h.onChoose(CHOICE);
    await flush();
    expect(t.top().view.error).toBe(UNREACHABLE_LINE);
    expect(t.top().view.choices.length).toBe(3);
  });

  it("shows the unreachable line when every ask is undefined", async () => {
    const t = setup();
    t.script.states = [undefined];
    await t.clock.advance(GRACE_MS);
    t.top().h.onChoose(CHOICE);
    await t.clock.advance(40000);
    expect(t.top().view.error).toBe(UNREACHABLE_LINE);
    expect(t.closed).toEqual([]);
  });
});

describe("the question session actions", () => {
  it("closes on Fermer and Plus tard after the grace, and dismisses on Écarter", async () => {
    const t = setup();
    t.top().h.onAction("fermer");
    expect(t.closed).toEqual([]);
    await t.clock.advance(GRACE_MS);
    t.top().h.onAction("fermer");
    expect(t.closed).toEqual(["closed"]);
    expect(t.session.isOpen()).toBe(false);
    expect(t.hidden()).toBe(1);
  });

  it("sends the dismissal on Écarter, then closes", async () => {
    const t = setup();
    await t.clock.advance(GRACE_MS);
    t.top().h.onAction("ecarter");
    await flush();
    expect(t.ports.dismiss).toHaveBeenCalledTimes(1);
    expect(t.closed).toEqual(["closed"]);
  });

  it("shows the unreachable line when the dismissal fails", async () => {
    const t = setup();
    vi.mocked(t.ports.dismiss as () => Promise<boolean>).mockResolvedValue(
      false,
    );
    await t.clock.advance(GRACE_MS);
    t.top().h.onAction("ecarter");
    await flush();
    expect(t.closed).toEqual([]);
    expect(t.top().view.error).toBe(UNREACHABLE_LINE);
  });
});
