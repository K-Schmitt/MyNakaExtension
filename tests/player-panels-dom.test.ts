import { describe, expect, it, vi } from "vitest";
import { watchPlayerPanels } from "../src/content/ui/player-panels-dom";

function setup(initiallyOpen = false) {
  let present = initiallyOpen;
  let mutate: () => void = () => {};
  const disconnect = vi.fn();
  const doc = {
    body: {} as HTMLElement,
    querySelector: vi.fn(() => (present ? ({} as Element) : null)),
  };
  const observe = vi.fn((_target: Node, onMutation: () => void) => {
    mutate = onMutation;
    return disconnect;
  });
  const onChange = vi.fn();
  const stop = watchPlayerPanels(doc, observe, onChange);
  const set = (value: boolean): void => {
    present = value;
    mutate();
  };
  return { doc, observe, onChange, disconnect, stop, set };
}

describe("watchPlayerPanels", () => {
  it("says open when the episode list or the settings panel appears, closed when it goes, once per change", () => {
    const { doc, observe, onChange, set } = setup();
    expect(observe).toHaveBeenCalledWith(doc.body, expect.any(Function));
    set(false);
    expect(doc.querySelector).toHaveBeenCalledWith(
      "div.nk-epd, div.nk-settings-panel",
    );
    expect(onChange).not.toHaveBeenCalled();
    set(true);
    set(true);
    expect(onChange.mock.calls).toEqual([[true]]);
    set(false);
    set(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("returns the disconnect of the observation", () => {
    const { stop, disconnect } = setup();
    stop();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("reads the state once at watch start: a panel already open is reported without any mutation", () => {
    const { onChange } = setup(true);
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it("says nothing at watch start when no panel is open", () => {
    const { onChange } = setup(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
