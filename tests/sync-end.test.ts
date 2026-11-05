import { describe, expect, it } from "vitest";
import { localFormat } from "../src/status/status-format";
import { LOADING_VIEW, toStatusView } from "../src/status/status-view";
import { createSyncEnd } from "../src/status/sync-end";

const view = (raw: unknown) => toStatusView(raw, localFormat());
const BUSY = view({ mode: "live", running: { kind: "sync", since: 1 } });
const IDLE = view({ mode: "live" });
const NO_ENGINE = view(undefined);

function setup() {
  let ends = 0;
  const watcher = createSyncEnd(() => {
    ends += 1;
  });
  return { watcher, ends: () => ends };
}

describe("createSyncEnd", () => {
  it("fires once when a view in progress is followed by one that is not", () => {
    const { watcher, ends } = setup();
    watcher.see(BUSY);
    watcher.see(BUSY);
    expect(ends()).toBe(0);
    watcher.see(IDLE);
    expect(ends()).toBe(1);
  });

  it("does not fire again while views stay idle", () => {
    const { watcher, ends } = setup();
    watcher.see(BUSY);
    watcher.see(IDLE);
    watcher.see(IDLE);
    watcher.see(IDLE);
    expect(ends()).toBe(1);
  });

  it("does not fire on idle views alone", () => {
    const { watcher, ends } = setup();
    watcher.see(IDLE);
    watcher.see(IDLE);
    expect(ends()).toBe(0);
  });

  it("ignores views that are not ready", () => {
    const { watcher, ends } = setup();
    watcher.see(BUSY);
    watcher.see(LOADING_VIEW);
    watcher.see(NO_ENGINE);
    expect(ends()).toBe(0);
    watcher.see(IDLE);
    expect(ends()).toBe(1);
  });

  it("fires for a reset whose pending action clears", () => {
    const { watcher, ends } = setup();
    watcher.see(view({ mode: "live", pendingActions: ["reset"] }));
    expect(ends()).toBe(0);
    watcher.see(IDLE);
    expect(ends()).toBe(1);
  });

  it("fires again for a second sync", () => {
    const { watcher, ends } = setup();
    watcher.see(BUSY);
    watcher.see(IDLE);
    watcher.see(BUSY);
    watcher.see(IDLE);
    expect(ends()).toBe(2);
  });
});
