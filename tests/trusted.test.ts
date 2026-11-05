import { describe, expect, it, vi } from "vitest";
import { onTrustedClick } from "../src/content/ui/trusted";
import { FakeElement } from "./ui-fakes";

describe("onTrustedClick", () => {
  it("ignores a click the page made up (isTrusted false)", () => {
    const el = new FakeElement("button");
    const fn = vi.fn();
    onTrustedClick(el, fn);
    el.click(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it("acts once on a trusted click", () => {
    const el = new FakeElement("button");
    const fn = vi.fn();
    onTrustedClick(el, fn);
    el.click(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not take a truthy non-boolean for trust", () => {
    const el = new FakeElement("button");
    const fn = vi.fn();
    onTrustedClick(el, fn);
    el.dispatch("click", "true");
    expect(fn).not.toHaveBeenCalled();
  });
});
