import { describe, expect, it } from "vitest";
import { createRowHost } from "../src/content/ui/row-host";
import { FakeDoc, type FakeElement } from "./ui-fakes";

describe("createRowHost", () => {
  it("makes a section with a closed shadow root holding the sheet", () => {
    const doc = new FakeDoc();
    const { host, root } = createRowHost(doc, ".x{}");
    const el = host as FakeElement;
    expect(el.tag).toBe("section");
    expect(el.shadowInit).toEqual([{ mode: "closed" }]);
    const style = el.shadow.children[0] as FakeElement;
    expect(style.tag).toBe("style");
    expect(style.textContent).toBe(".x{}");
    root.replaceChildren(doc.createElement("div"));
    expect(el.shadow.children[0]).toBe(style);
  });

  it("resets the host and keeps it a block with a bottom margin, every declaration !important", () => {
    const { host } = createRowHost(new FakeDoc(), "");
    const css = host.style.cssText;
    expect(css).toContain("all: initial !important");
    expect(css).toContain("display: block !important");
    expect(css).toContain("margin: 0 0 24px !important");
    for (const d of css.split(";").filter((x) => x.trim() !== "")) {
      expect(d, d).toMatch(/ !important$/);
    }
  });

  it("is not put in the page", () => {
    const { host } = createRowHost(new FakeDoc(), "");
    expect(host.parentNode).toBeNull();
  });
});
