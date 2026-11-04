import { describe, expect, it } from "vitest";
import { MARKER, strings } from "./naka-bridge-fakes";

// Positive control for the secrecy scanner: it must find the marker wherever a leak could hide.
describe("strings() finds a marker in", () => {
  const found = (value: unknown) => strings(value).join("|").includes(MARKER);

  it("a plain object value and an object key", () => {
    expect(found({ a: MARKER })).toBe(true);
    expect(found({ [MARKER]: 1 })).toBe(true);
  });

  it("an error message", () => {
    expect(found(new Error(MARKER))).toBe(true);
  });

  it("an error message that is not an own property", () => {
    class Getter extends Error {
      override get message(): string {
        return MARKER;
      }
    }
    const error = new Getter();
    error.stack = "no marker here";
    expect(found(error)).toBe(true);
  });

  it("an error cause", () => {
    expect(found(new Error("x", { cause: MARKER }))).toBe(true);
    expect(found(new Error("x", { cause: new Error(MARKER) }))).toBe(true);
  });

  it("an own non-enumerable field", () => {
    const error = new Error("x");
    Object.defineProperty(error, "hidden", {
      value: MARKER,
      enumerable: false,
    });
    expect(found(error)).toBe(true);
  });

  it("a symbol-keyed field", () => {
    expect(found({ [Symbol("k")]: MARKER })).toBe(true);
    expect(found({ [Symbol(MARKER)]: 1 })).toBe(true);
    const error = new Error("x");
    Object.defineProperty(error, Symbol("s"), { value: MARKER });
    expect(found(error)).toBe(true);
  });

  it("a nested array", () => {
    expect(found([[1, [{ deep: [MARKER] }]]])).toBe(true);
  });

  it("nothing, when the marker is absent", () => {
    expect(found({ a: [1, "b"], [Symbol("k")]: new Error("x") })).toBe(false);
  });
});
