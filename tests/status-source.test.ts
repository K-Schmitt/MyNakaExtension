import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every way to turn a string into markup (Ruling 19). The page writes remote text (titles, the
// SensCritique username) with textContent only; no source of the extension may use any of these.
const HTML_SINKS =
  /innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|setHTMLUnsafe|srcdoc/g;

function htmlSinks(source: string): string[] {
  return [...source.matchAll(HTML_SINKS)].map((m) => m[0]);
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : [path];
  });
}

describe("the extension's source", () => {
  it("the scan finds each sink in a planted fixture, and nothing in plain DOM code (control)", () => {
    const planted = [
      "el.innerHTML = title;",
      "el.outerHTML = title;",
      "el.insertAdjacentHTML('beforeend', title);",
      "document.write(title);",
      "new DOMParser().parseFromString(title, 'text/html');",
      "range.createContextualFragment(title);",
      "el.setHTMLUnsafe(title);",
      "frame.srcdoc = title;",
    ];
    for (const line of planted) expect(htmlSinks(line), line).toHaveLength(1);
    expect(htmlSinks("item.textContent = title;")).toEqual([]);
  });

  it("uses no HTML sink, in any file under src", () => {
    const files = sources("src");
    for (const dir of ["content", "core", "ext", "naka", "page", "sc", "sw"]) {
      expect(
        files.some((f) => f.startsWith(join("src", dir))),
        dir,
      ).toBe(true);
    }
    expect(files).toContain(join("src", "status", "status.ts"));
    for (const file of files) {
      expect(htmlSinks(readFileSync(file, "utf8")), file).toEqual([]);
    }
  });
});
