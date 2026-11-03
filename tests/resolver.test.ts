import { describe, expect, it } from "vitest";
import type { Pair } from "../src/core/list-diff";
import {
  type ResolverPorts,
  resolveNakaIds,
  resolveScIds,
} from "../src/core/resolver";
import { emptyState, type SyncState } from "../src/core/state";
import type { Candidate, Titled } from "../src/core/title-match";

const p = (nakaId: number, scId: number): Pair => ({ nakaId, scId });
const film = (title: string, extra: Partial<Titled> = {}): Titled => ({
  title,
  year: 2000,
  type: "film",
  ...extra,
});
const cand = (id: number, title: string, extra: Partial<Titled> = {}) => ({
  id,
  ...film(title, extra),
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

type Script = {
  naka?: Record<number, Titled | undefined | "reject" | "reject-plain">;
  sc?: Record<number, Titled | undefined | "reject" | "reject-plain">;
  searchSc?: Record<string, Candidate[] | "reject">;
  searchNaka?: Record<string, Candidate[] | "reject">;
};

function ports(script: Script): ResolverPorts & { log: string[] } {
  const log: string[] = [];
  const describe =
    (name: string, table: NonNullable<Script["naka"]>) =>
    async (id: number): Promise<Titled | undefined> => {
      log.push(`${name}:${id}`);
      const entry = table[id];
      if (entry === "reject") throw new Error("boom");
      if (entry === "reject-plain") throw "plain";
      return entry;
    };
  const search =
    (name: string, table: NonNullable<Script["searchSc"]>) =>
    async (q: string): Promise<Candidate[]> => {
      log.push(`${name}:${q}`);
      const entry = table[q];
      if (entry === "reject") throw new Error("boom");
      return entry ?? [];
    };
  return {
    log,
    describeNaka: describe("describeNaka", script.naka ?? {}),
    describeSc: describe("describeSc", script.sc ?? {}),
    searchSc: search("searchSc", script.searchSc ?? {}),
    searchNaka: search("searchNaka", script.searchNaka ?? {}),
  };
}

function rich(): SyncState {
  return {
    version: 1,
    mapping: [p(1, 11), p(2, 12)],
    snapshot: [p(1, 11)],
    settled: [p(2, 12)],
    pending: [
      { kind: "removal", removeFrom: "sc", pair: p(1, 11), asked: true },
    ],
    handled: ["k"],
    unlinked: [{ side: "naka", id: 90, title: "Old", reason: "no-match" }],
    retryLast: [p(2, 12)],
    run: 4,
    presence: { naka: [{ id: 3, from: 1, to: 4 }], sc: [] },
    threshold: 7,
  };
}

describe("resolveNakaIds", () => {
  it("maps an id whose title matches exactly one candidate", async () => {
    const pt = ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(50, "Dune"), cand(51, "Other")] },
    });
    const out = await resolveNakaIds([5], rich(), pt);
    expect(out).toEqual({ ...rich(), mapping: [p(1, 11), p(2, 12), p(5, 50)] });
  });

  it("replaces nothing and keeps 1:1 when the naka id was not mapped", async () => {
    const pt = ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(50, "Dune")] },
    });
    const out = await resolveNakaIds([5], emptyState(), pt);
    expect(out.mapping).toEqual([p(5, 50)]);
  });

  it("adds one ambiguity item listing both ids, mapping unchanged", async () => {
    const pt = ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(50, "Dune"), cand(51, "Dune")] },
    });
    const out = await resolveNakaIds([5], rich(), pt);
    expect(out).toEqual({
      ...rich(),
      pending: [
        ...rich().pending,
        { kind: "ambiguity", side: "naka", id: 5, candidateIds: [50, 51] },
      ],
    });
  });

  it("records no-match when no candidate is found", async () => {
    const pt = ports({ naka: { 5: film("Dune") } });
    const out = await resolveNakaIds([5], rich(), pt);
    expect(out).toEqual({
      ...rich(),
      unlinked: [
        ...rich().unlinked,
        { side: "naka", id: 5, title: "Dune", reason: "no-match" },
      ],
    });
  });

  it("records no-match when candidates exist but none matches", async () => {
    const pt = ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(50, "Something else")] },
    });
    const out = await resolveNakaIds([5], emptyState(), pt);
    expect(out.unlinked).toEqual([
      { side: "naka", id: 5, title: "Dune", reason: "no-match" },
    ]);
    expect(out.mapping).toEqual([]);
    expect(out.pending).toEqual([]);
  });

  it("records not-in-catalogue with an empty title when describe is undefined", async () => {
    const pt = ports({ naka: { 5: undefined } });
    const out = await resolveNakaIds([5], emptyState(), pt);
    expect(out.unlinked).toEqual([
      { side: "naka", id: 5, title: "", reason: "not-in-catalogue" },
    ]);
    expect(pt.log).toEqual(["describeNaka:5"]);
  });

  it("counts a duplicated candidate id once (match, not ambiguous)", async () => {
    const pt = ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(50, "Dune"), cand(50, "Dune")] },
    });
    const out = await resolveNakaIds([5], emptyState(), pt);
    expect(out.mapping).toEqual([p(5, 50)]);
    expect(out.pending).toEqual([]);
  });

  it("keeps the first copy of a duplicated candidate id", async () => {
    const pt = ports({
      naka: { 5: film("Dune", { year: 2021 }) },
      searchSc: {
        Dune: [
          cand(50, "Dune", { year: 2021 }),
          cand(50, "Dune", { year: 1984 }),
        ],
      },
    });
    const out = await resolveNakaIds([5], emptyState(), pt);
    expect(out.mapping).toEqual([p(5, 50)]);
  });

  it("searches by originalTitle only when the first search returned nothing", async () => {
    const pt = ports({
      naka: { 5: film("Le Titre", { originalTitle: "The Title" }) },
      searchSc: { "The Title": [cand(50, "The Title")] },
    });
    const out = await resolveNakaIds([5], emptyState(), pt);
    expect(pt.log).toEqual([
      "describeNaka:5",
      "searchSc:Le Titre",
      "searchSc:The Title",
    ]);
    expect(out.mapping).toEqual([p(5, 50)]);
  });

  it("does not search by originalTitle when the first search had candidates but no match", async () => {
    const pt = ports({
      naka: { 5: film("Le Titre", { originalTitle: "The Title" }) },
      searchSc: {
        "Le Titre": [cand(60, "Unrelated")],
        "The Title": [cand(50, "The Title")],
      },
    });
    const out = await resolveNakaIds([5], emptyState(), pt);
    expect(pt.log).toEqual(["describeNaka:5", "searchSc:Le Titre"]);
    expect(out.mapping).toEqual([]);
    expect(out.unlinked).toEqual([
      { side: "naka", id: 5, title: "Le Titre", reason: "no-match" },
    ]);
  });

  it("does not run a second search when originalTitle is absent or empty", async () => {
    const pt = ports({
      naka: { 5: film("A"), 6: film("B", { originalTitle: "" }) },
    });
    await resolveNakaIds([5, 6], emptyState(), pt);
    expect(pt.log).toEqual([
      "describeNaka:5",
      "searchSc:A",
      "describeNaka:6",
      "searchSc:B",
    ]);
  });

  it("does not re-map when the matched candidate belongs to another id (swap guard)", async () => {
    const pt = ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(11, "Dune")] },
    });
    const out = await resolveNakaIds([5], rich(), pt);
    expect(out.mapping).toEqual([p(1, 11), p(2, 12)]);
    expect(out.pending).toEqual([
      ...rich().pending,
      { kind: "ambiguity", side: "naka", id: 5, candidateIds: [11] },
    ]);
  });

  it("skips an id already paired with the matched candidate", async () => {
    const state: SyncState = { ...emptyState(), mapping: [p(5, 50)] };
    const pt = ports({ naka: { 5: film("Dune") } });
    const out = await resolveNakaIds([5], state, pt);
    expect(out).toEqual(state);
    expect(pt.log).toEqual([]);
  });

  it("sees mappings made earlier in the same run (two ids matching one candidate)", async () => {
    const pt = ports({
      naka: { 5: film("Dune"), 6: film("Dune") },
      searchSc: { Dune: [cand(50, "Dune")] },
    });
    const out = await resolveNakaIds([5, 6], emptyState(), pt);
    expect(out.mapping).toEqual([p(5, 50)]);
    expect(out.pending).toEqual([
      { kind: "ambiguity", side: "naka", id: 6, candidateIds: [50] },
    ]);
  });

  it("skips an id that is already mapped (zero port calls)", async () => {
    const pt = ports({ naka: { 1: film("X") } });
    const out = await resolveNakaIds([1], rich(), pt);
    expect(pt.log).toEqual([]);
    expect(out).toEqual(rich());
  });

  it("skips an id with a pending naka ambiguity (zero port calls)", async () => {
    const state: SyncState = {
      ...emptyState(),
      pending: [
        { kind: "ambiguity", side: "naka", id: 5, candidateIds: [50, 51] },
      ],
    };
    const pt = ports({ naka: { 5: film("Dune") } });
    const out = await resolveNakaIds([5], state, pt);
    expect(pt.log).toEqual([]);
    expect(out).toEqual(state);
  });

  it("does not skip on a pending ambiguity of the other side or a removal", async () => {
    const state: SyncState = {
      ...emptyState(),
      pending: [
        { kind: "ambiguity", side: "sc", id: 5, candidateIds: [50, 51] },
        { kind: "removal", removeFrom: "naka", pair: p(5, 9), asked: false },
      ],
    };
    const pt = ports({ naka: { 5: film("Dune") } });
    await resolveNakaIds([5], state, pt);
    expect(pt.log).toEqual(["describeNaka:5", "searchSc:Dune"]);
  });

  it("skips an id already listed as unlinked on the naka side (zero port calls)", async () => {
    const pt = ports({ naka: { 90: film("Old") } });
    const out = await resolveNakaIds([90], rich(), pt);
    expect(pt.log).toEqual([]);
    expect(out).toEqual(rich());
  });

  it("does not skip on an unlinked entry of the other side", async () => {
    const state: SyncState = {
      ...emptyState(),
      unlinked: [{ side: "sc", id: 5, title: "x", reason: "no-match" }],
    };
    const pt = ports({ naka: { 5: film("Dune") } });
    const out = await resolveNakaIds([5], state, pt);
    expect(pt.log).toEqual(["describeNaka:5", "searchSc:Dune"]);
    expect(out.unlinked).toHaveLength(2);
  });

  it("does not skip when only the other side of a pair uses the same number", async () => {
    const state: SyncState = { ...emptyState(), mapping: [p(9, 5)] };
    const pt = ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(50, "Dune")] },
    });
    const out = await resolveNakaIds([5], state, pt);
    expect(out.mapping).toEqual([p(9, 5), p(5, 50)]);
  });

  it("processes duplicated input ids once", async () => {
    const pt = ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(50, "Dune")] },
    });
    await resolveNakaIds([5, 5, 5], emptyState(), pt);
    expect(pt.log).toEqual(["describeNaka:5", "searchSc:Dune"]);
  });

  it("processes a duplicated id once even when its first attempt failed", async () => {
    const pt = ports({ naka: { 5: "reject" } });
    await resolveNakaIds([5, 5], emptyState(), pt);
    expect(pt.log).toEqual(["describeNaka:5"]);
  });

  it("de-duplicates the candidates of the originalTitle search too", async () => {
    const pt = ports({
      naka: { 5: film("Le Titre", { originalTitle: "The Title" }) },
      searchSc: {
        "The Title": [cand(50, "The Title"), cand(50, "The Title")],
      },
    });
    const out = await resolveNakaIds([5], emptyState(), pt);
    expect(out.mapping).toEqual([p(5, 50)]);
    expect(out.pending).toEqual([]);
  });

  it("processes ids in order, one at a time", async () => {
    const pt = ports({
      naka: { 7: film("A"), 3: film("B"), 9: film("C") },
    });
    await resolveNakaIds([7, 3, 9], emptyState(), pt);
    expect(pt.log).toEqual([
      "describeNaka:7",
      "searchSc:A",
      "describeNaka:3",
      "searchSc:B",
      "describeNaka:9",
      "searchSc:C",
    ]);
  });

  it("isolates a rejected search: that id is untouched, the next is resolved", async () => {
    const pt = ports({
      naka: { 5: film("Bad"), 6: film("Good") },
      searchSc: { Bad: "reject", Good: [cand(60, "Good")] },
    });
    const out = await resolveNakaIds([5, 6], emptyState(), pt);
    expect(out.mapping).toEqual([p(6, 60)]);
    expect(out.unlinked).toEqual([]);
    expect(out.pending).toEqual([]);
  });

  it("isolates a rejected originalTitle search", async () => {
    const pt = ports({
      naka: { 5: film("Bad", { originalTitle: "Bad2" }), 6: film("Good") },
      searchSc: { Bad2: "reject", Good: [cand(60, "Good")] },
    });
    const out = await resolveNakaIds([5, 6], emptyState(), pt);
    expect(out.mapping).toEqual([p(6, 60)]);
    expect(out.unlinked).toEqual([]);
  });

  it("isolates a rejected describe, including a non-Error rejection", async () => {
    const pt = ports({
      naka: { 5: "reject", 6: "reject-plain", 7: film("Good") },
      searchSc: { Good: [cand(70, "Good")] },
    });
    const out = await resolveNakaIds([5, 6, 7], emptyState(), pt);
    expect(out.mapping).toEqual([p(7, 70)]);
    expect(out.unlinked).toEqual([]);
  });

  it("never rejects because of a port", async () => {
    const pt = ports({ naka: { 5: "reject" } });
    await expect(resolveNakaIds([5], emptyState(), pt)).resolves.toEqual(
      emptyState(),
    );
  });

  it("merges unlinked entries, keeping existing ones in place, once per side+id", async () => {
    const state: SyncState = {
      ...emptyState(),
      unlinked: [
        { side: "naka", id: 90, title: "Old", reason: "no-match" },
        { side: "sc", id: 5, title: "Sc5", reason: "no-match" },
      ],
    };
    const pt = ports({ naka: { 5: film("Five"), 6: undefined } });
    const out = await resolveNakaIds([5, 6], state, pt);
    expect(out.unlinked).toEqual([
      { side: "naka", id: 90, title: "Old", reason: "no-match" },
      { side: "sc", id: 5, title: "Sc5", reason: "no-match" },
      { side: "naka", id: 5, title: "Five", reason: "no-match" },
      { side: "naka", id: 6, title: "", reason: "not-in-catalogue" },
    ]);
  });

  it("leaves everything but mapping, pending and unlinked untouched, and never mutates inputs", async () => {
    const state = deepFreeze(rich());
    const ids = deepFreeze([5, 6, 7]);
    const pt = ports({
      naka: { 5: film("Dune"), 6: film("Twin"), 7: film("Nothing") },
      searchSc: {
        Dune: [cand(50, "Dune")],
        Twin: [cand(61, "Twin"), cand(62, "Twin")],
      },
    });
    const out = await resolveNakaIds(ids, state, pt);
    expect(out).toEqual({
      version: 1,
      mapping: [p(1, 11), p(2, 12), p(5, 50)],
      snapshot: [p(1, 11)],
      settled: [p(2, 12)],
      pending: [
        { kind: "removal", removeFrom: "sc", pair: p(1, 11), asked: true },
        { kind: "ambiguity", side: "naka", id: 6, candidateIds: [61, 62] },
      ],
      handled: ["k"],
      unlinked: [
        { side: "naka", id: 90, title: "Old", reason: "no-match" },
        { side: "naka", id: 7, title: "Nothing", reason: "no-match" },
      ],
      retryLast: [p(2, 12)],
      run: 4,
      presence: { naka: [{ id: 3, from: 1, to: 4 }], sc: [] },
      threshold: 7,
    });
    expect(out).not.toBe(state);
  });

  it("returns an equal copy for an empty id list", async () => {
    const state = deepFreeze(rich());
    const out = await resolveNakaIds([], state, ports({}));
    expect(out).toEqual(rich());
  });
});

describe("resolveScIds (mirror)", () => {
  it("maps with the sc id on the scId side", async () => {
    const pt = ports({
      sc: { 50: film("Dune") },
      searchNaka: { Dune: [cand(5, "Dune")] },
    });
    const out = await resolveScIds([50], rich(), pt);
    expect(out).toEqual({ ...rich(), mapping: [p(1, 11), p(2, 12), p(5, 50)] });
    expect(pt.log).toEqual(["describeSc:50", "searchNaka:Dune"]);
  });

  it("adds a sc-side ambiguity", async () => {
    const pt = ports({
      sc: { 50: film("Dune") },
      searchNaka: { Dune: [cand(5, "Dune"), cand(6, "Dune")] },
    });
    const out = await resolveScIds([50], emptyState(), pt);
    expect(out.pending).toEqual([
      { kind: "ambiguity", side: "sc", id: 50, candidateIds: [5, 6] },
    ]);
    expect(out.mapping).toEqual([]);
  });

  it("records no-match on the sc side", async () => {
    const pt = ports({ sc: { 50: film("Dune") } });
    const out = await resolveScIds([50], emptyState(), pt);
    expect(out.unlinked).toEqual([
      { side: "sc", id: 50, title: "Dune", reason: "no-match" },
    ]);
  });

  it("records not-in-catalogue on the sc side", async () => {
    const pt = ports({ sc: { 50: undefined } });
    const out = await resolveScIds([50], emptyState(), pt);
    expect(out.unlinked).toEqual([
      { side: "sc", id: 50, title: "", reason: "not-in-catalogue" },
    ]);
  });

  it("guards the swap on the naka candidate", async () => {
    const pt = ports({
      sc: { 50: film("Dune") },
      searchNaka: { Dune: [cand(1, "Dune")] },
    });
    const out = await resolveScIds([50], rich(), pt);
    expect(out.mapping).toEqual([p(1, 11), p(2, 12)]);
    expect(out.pending).toEqual([
      ...rich().pending,
      { kind: "ambiguity", side: "sc", id: 50, candidateIds: [1] },
    ]);
  });

  it("skips mapped scIds, sc ambiguities and sc unlinked entries without any call", async () => {
    const state: SyncState = {
      ...emptyState(),
      mapping: [p(1, 11)],
      pending: [
        { kind: "ambiguity", side: "sc", id: 12, candidateIds: [1, 2] },
      ],
      unlinked: [{ side: "sc", id: 13, title: "t", reason: "no-match" }],
    };
    const pt = ports({});
    const out = await resolveScIds([11, 12, 13], state, pt);
    expect(pt.log).toEqual([]);
    expect(out).toEqual(state);
  });

  it("does not skip an sc id that only matches a naka-side entry", async () => {
    const state: SyncState = {
      ...emptyState(),
      mapping: [p(11, 1)],
      pending: [{ kind: "ambiguity", side: "naka", id: 12, candidateIds: [1] }],
      unlinked: [{ side: "naka", id: 13, title: "t", reason: "no-match" }],
    };
    const pt = ports({});
    await resolveScIds([11, 12, 13], state, pt);
    expect(pt.log).toEqual(["describeSc:11", "describeSc:12", "describeSc:13"]);
  });

  it("searches by originalTitle only when the first search is empty", async () => {
    const pt = ports({
      sc: { 50: film("Titre", { originalTitle: "Title" }) },
      searchNaka: { Title: [cand(5, "Title")] },
    });
    const out = await resolveScIds([50], emptyState(), pt);
    expect(pt.log).toEqual([
      "describeSc:50",
      "searchNaka:Titre",
      "searchNaka:Title",
    ]);
    expect(out.mapping).toEqual([p(5, 50)]);
  });

  it("isolates failures and keeps order", async () => {
    const pt = ports({
      sc: { 50: "reject", 51: film("Good") },
      searchNaka: { Good: [cand(6, "Good")] },
    });
    const out = await resolveScIds([50, 51], emptyState(), pt);
    expect(out.mapping).toEqual([p(6, 51)]);
    expect(pt.log).toEqual([
      "describeSc:50",
      "describeSc:51",
      "searchNaka:Good",
    ]);
  });
});

// A match whose counterpart the owner is still asked about, on the counterpart's own side, is never
// mapped: the question goes to the owner, as for the swap guard (G1).
describe("a match whose counterpart has an open question on its own side", () => {
  type Ambiguity = Extract<SyncState["pending"][number], { kind: "ambiguity" }>;
  const question = (
    side: "naka" | "sc",
    id: number,
    candidateIds: number[],
  ): Ambiguity => ({ kind: "ambiguity", side, id, candidateIds });
  const withPending = (...pending: Ambiguity[]): SyncState => ({
    ...emptyState(),
    pending,
  });
  const nakaPorts = () =>
    ports({
      naka: { 5: film("Dune") },
      searchSc: { Dune: [cand(50, "Dune")] },
    });
  const scPorts = () =>
    ports({
      sc: { 50: film("Dune") },
      searchNaka: { Dune: [cand(5, "Dune")] },
    });

  it("Naka direction: 5 matches 50 while SensCritique's question on 50 is open, so 5 is asked about 50", async () => {
    const open = question("sc", 50, [5, 6]);
    const state = deepFreeze(withPending(open));
    const out = await resolveNakaIds([5], state, nakaPorts());
    expect(out.mapping).toEqual([]);
    expect(out.pending).toEqual([open, question("naka", 5, [50])]);
  });

  it("SC direction: 50 matches 5 while Naka's question on 5 is open, so 50 is asked about 5", async () => {
    const open = question("naka", 5, [50, 51]);
    const state = deepFreeze(withPending(open));
    const out = await resolveScIds([50], state, scPorts());
    expect(out.mapping).toEqual([]);
    expect(out.pending).toEqual([open, question("sc", 50, [5])]);
  });

  it.each([
    ["no question", []],
    [
      "a Naka-side question numbered like the product",
      [question("naka", 50, [1])],
    ],
    [
      "a SensCritique-side question on another product",
      [question("sc", 51, [5])],
    ],
  ] as [string, Ambiguity[]][])(
    "Naka direction with %s still maps",
    async (_name, pending) => {
      const out = await resolveNakaIds(
        [5],
        withPending(...pending),
        nakaPorts(),
      );
      expect(out.mapping).toEqual([p(5, 50)]);
      expect(out.pending).toEqual(pending);
    },
  );

  it.each([
    ["no question", []],
    [
      "a SensCritique-side question numbered like the title",
      [question("sc", 5, [1])],
    ],
    ["a Naka-side question on another title", [question("naka", 6, [50])]],
  ] as [string, Ambiguity[]][])(
    "SC direction with %s still maps",
    async (_name, pending) => {
      const out = await resolveScIds([50], withPending(...pending), scPorts());
      expect(out.mapping).toEqual([p(5, 50)]);
      expect(out.pending).toEqual(pending);
    },
  );
});
