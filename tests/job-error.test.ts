import { describe, expect, it } from "vitest";
import { type JobError, JobRejected } from "../src/ext/job-error";

const CODES: JobError[] = [
  "no-naka-tab",
  "naka-session",
  "sc-session",
  "other-account",
  "stored-state",
  "unavailable",
  "finish-limit",
  "naka-list-empty",
  "naka-tab-changed",
];

describe("JobRejected", () => {
  it.each(CODES)("carries the code %s", (code) => {
    const error = new JobRejected(code);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("says the finish limit in fixed words", () => {
    expect(new JobRejected("finish-limit").message).toBe(
      "too many finishes this hour",
    );
  });

  it("says an empty Naka list in fixed words", () => {
    expect(new JobRejected("naka-list-empty").message).toBe(
      "Naka playlist read empty",
    );
  });

  it("says a Naka tab that changed page in fixed words", () => {
    expect(new JobRejected("naka-tab-changed").message).toBe(
      "Naka tab changed page",
    );
  });

  it("has one distinct message per code", () => {
    const messages = CODES.map((code) => new JobRejected(code).message);
    expect(new Set(messages).size).toBe(CODES.length);
  });
});
