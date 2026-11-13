import { describe, expect, it } from "vitest";
import {
  MAX_FICHE_LINKS,
  parseFicheLinks,
} from "../src/ext/fiche-links-schema";
import { StoredStateError } from "../src/ext/stored-error";

describe("parseFicheLinks", () => {
  it("parses a link from a content id to a product id", () => {
    expect(parseFicheLinks({ "7": 99 })).toEqual({ "7": 99 });
  });

  it("gives no links when the key is absent", () => {
    expect(parseFicheLinks(undefined)).toEqual({});
  });

  it.each([0, -3, 1.5, "99", null])("rejects the product id %j", (id) => {
    expect(() => parseFicheLinks({ "7": id })).toThrow(StoredStateError);
  });

  it.each(["abc", "0", "-1", "07", "1.5", ""])("rejects the key %j", (key) => {
    expect(() => parseFicheLinks({ [key]: 99 })).toThrow(StoredStateError);
  });

  it.each([null, [], "x", 3])("rejects the value %j", (raw) => {
    expect(() => parseFicheLinks(raw)).toThrow(StoredStateError);
  });

  it("accepts the maximum and rejects one more", () => {
    const build = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`${i + 1}`, 1]));
    expect(Object.keys(parseFicheLinks(build(MAX_FICHE_LINKS)))).toHaveLength(
      MAX_FICHE_LINKS,
    );
    expect(() => parseFicheLinks(build(MAX_FICHE_LINKS + 1))).toThrow(
      StoredStateError,
    );
  });
});
