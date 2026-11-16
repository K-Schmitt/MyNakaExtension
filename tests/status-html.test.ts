import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(
  join(__dirname, "..", "src/status/status.html"),
  "utf8",
);

function simulationSection(): string {
  const start = html.indexOf('<section id="simulation"');
  const end = html.indexOf('<section id="settings"');
  return html.slice(start, end);
}

describe("status page headings", () => {
  it("the planned-writes sections sit one level under « Simulation »", () => {
    const inside = simulationSection();
    expect(inside.match(/<h2[ >]/g)?.length).toBe(1);
    expect(inside).toContain("<h3>Écritures prévues</h3>");
    expect(inside).toContain("<h3>Écritures prévues au prochain passage</h3>");
  });

  // The mode is unknown until the worker answers: the page opens with the section hidden.
  it("opens with « Simulation » hidden", () => {
    expect(html).toContain('<section id="simulation" hidden>');
  });

  it("styles the sub-headings like the section headings", () => {
    const css = readFileSync(
      join(__dirname, "..", "src/status/status.css"),
      "utf8",
    );
    expect(css).toMatch(/\nh2,\nh3\s*\{/);
  });
});
