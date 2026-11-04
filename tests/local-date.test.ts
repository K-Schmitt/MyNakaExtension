import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localDate } from "../src/sw/local-date";

// Each block switches the process time zone (Node re-reads TZ when it is assigned), so the file runs
// under both zones whatever TZ the gate has. Kiritimati is UTC+14 and Adak UTC-10 in November: around
// their midnights the UTC day differs from the local one, so a UTC slice fails in both.
const ZONES: [string, [string, string][]][] = [
  [
    "Pacific/Kiritimati",
    [
      ["2026-11-04T09:59:59Z", "2026-11-04"],
      ["2026-11-04T10:00:00Z", "2026-11-05"],
      ["2026-12-31T10:30:00Z", "2027-01-01"],
    ],
  ],
  [
    "America/Adak",
    [
      ["2026-11-05T09:59:59Z", "2026-11-04"],
      ["2026-11-05T10:00:00Z", "2026-11-05"],
      ["2027-01-01T09:30:00Z", "2026-12-31"],
    ],
  ],
];

describe.each(ZONES)("the local date under TZ=%s", (zone, cases) => {
  const before = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = zone;
  });

  afterAll(() => {
    process.env.TZ = before;
  });

  it("the zone is in force", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  it.each(cases)("%s is %s", (instant, day) => {
    expect(localDate(new Date(instant))).toBe(day);
  });
});

describe("the local date: format", () => {
  it("pads the month and the day", () => {
    expect(localDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});
