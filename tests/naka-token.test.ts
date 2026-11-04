import { describe, expect, it } from "vitest";
import { readNakaToken } from "../src/content/naka-token";

const TOKEN = "NAKA-TOKEN-MARKER-5e1f";

function storage(value: string | null) {
  const asked: string[] = [];
  return {
    asked,
    store: {
      getItem: (key: string) => {
        asked.push(key);
        return key === "nakastream-auth" ? value : null;
      },
    },
  };
}

const auth = (state: unknown) => JSON.stringify({ state, version: 0 });

describe("the Naka token, read in the isolated script only", () => {
  it("is state.token of the page's auth record", () => {
    const { store, asked } = storage(
      auth({ token: TOKEN, user: { id: 77, email: "x@y" } }),
    );
    expect(readNakaToken(store)).toBe(TOKEN);
    expect(asked).toEqual(["nakastream-auth"]);
  });

  it.each([
    ["no auth record (logged out)", null],
    ["a record that is not JSON", "{not json"],
    ["a JSON null", "null"],
    ["no state", JSON.stringify({ token: TOKEN })],
    ["a null state", auth(null)],
    ["a state without token", auth({ user: { id: 77 } })],
    ["an empty token", auth({ token: "" })],
    ["a token that is not a string", auth({ token: 42 })],
    ["a state that is an array", auth([TOKEN])],
  ])("is absent with %s", (_name, value) => {
    expect(readNakaToken(storage(value).store)).toBeUndefined();
  });

  it("never throws, even when the storage does", () => {
    const store = {
      getItem: () => {
        throw new Error(`denied ${TOKEN}`);
      },
    };
    expect(readNakaToken(store)).toBeUndefined();
  });
});
