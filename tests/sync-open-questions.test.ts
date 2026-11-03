import { describe, expect, it } from "vitest";
import { emptyState, type SyncState } from "../src/core/state";
import { runSync, type SyncPorts } from "../src/core/sync-runner";
import type { Candidate, Titled } from "../src/core/title-match";

// The REAL runner over two catalogues: the owner's open question on a title is never decided by the
// other direction of the same run, nor of a later one (G1).

const N = 42;
const M = 43;
const X = 1042;
const Y = 2042;
const FILM: Titled = { title: "Le Film", year: 2001, type: "film" };

type Opts = {
  naka: number[];
  sc: number[];
  nakaTitles: Record<number, Titled>;
  scTitles: Record<number, Titled>;
};

function candidates(titles: Record<number, Titled>, q: string): Candidate[] {
  return Object.entries(titles)
    .filter(([, titled]) => titled.title === q)
    .map(([id, titled]) => ({ id: Number(id), ...titled }));
}

function world(o: Opts) {
  const w = {
    naka: new Set(o.naka),
    sc: new Set(o.sc),
    state: emptyState() as SyncState,
    writes: [] as string[],
  };
  const ports: SyncPorts = {
    load: async () => w.state,
    save: async (state) => {
      w.state = state;
    },
    nakaIds: async () => [...w.naka],
    scWishlistIds: async () => [...w.sc],
    addToSc: async (id) => {
      w.writes.push(`addToSc:${id}`);
      w.sc.add(id);
    },
    addToNaka: async (id) => {
      w.writes.push(`addToNaka:${id}`);
      w.naka.add(id);
    },
    describeNaka: async (id) => o.nakaTitles[id],
    describeSc: async (id) => o.scTitles[id],
    searchNaka: async (q) => candidates(o.nakaTitles, q),
    searchSc: async (q) => candidates(o.scTitles, q),
  };
  return { w, ports };
}

const ask = (side: "naka" | "sc", id: number, candidateIds: number[]) => ({
  kind: "ambiguity",
  side,
  id,
  candidateIds,
});

describe("an open question is never decided by the other direction", () => {
  it("the probe's single run: Naka asks about 42, so SensCritique's 1042 does not map 42", async () => {
    const { w, ports } = world({
      naka: [N],
      sc: [X],
      nakaTitles: { [N]: FILM },
      scTitles: {
        [X]: { ...FILM, year: 2000 },
        [Y]: { ...FILM, year: 2002 },
      },
    });
    await runSync(ports);
    expect(w.state.mapping).toEqual([]);
    expect(w.state.pending).toEqual([
      ask("naka", N, [X, Y]),
      ask("sc", X, [N]),
    ]);
    await runSync(ports);
    expect(w.writes).toEqual([]);
    expect(w.state.mapping).toEqual([]);
  });

  it("the mirror over two runs: SensCritique asks about 1042, so Naka's 42 does not map 1042", async () => {
    const { w, ports } = world({
      naka: [],
      sc: [X],
      nakaTitles: { [N]: FILM, [M]: FILM },
      scTitles: { [X]: FILM },
    });
    await runSync(ports);
    expect(w.state.pending).toEqual([ask("sc", X, [N, M])]);
    w.naka.add(N);
    await runSync(ports);
    expect(w.state.mapping).toEqual([]);
    expect(w.state.pending).toEqual([
      ask("sc", X, [N, M]),
      ask("naka", N, [X]),
    ]);
    expect(w.writes).toEqual([]);
  });

  it("with no open question, a title on both sides maps as before", async () => {
    const { w, ports } = world({
      naka: [N],
      sc: [X],
      nakaTitles: { [N]: FILM },
      scTitles: { [X]: FILM },
    });
    await runSync(ports);
    expect(w.state.mapping).toEqual([{ nakaId: N, scId: X }]);
    expect(w.state.pending).toEqual([]);
    expect(w.writes).toEqual([]);
  });

  it("with no open question, a SensCritique-only title maps and is added to Naka as before", async () => {
    const { w, ports } = world({
      naka: [],
      sc: [X],
      nakaTitles: { [N]: FILM },
      scTitles: { [X]: FILM },
    });
    await runSync(ports);
    expect(w.state.mapping).toEqual([{ nakaId: N, scId: X }]);
    expect(w.writes).toEqual([`addToNaka:${N}`]);
  });
});
