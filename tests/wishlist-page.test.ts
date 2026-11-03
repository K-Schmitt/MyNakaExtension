import { describe, expect, it } from "vitest";
import { scToTitled } from "../src/core/adapt-titles";
import { nextOffset, parseWishlistPage } from "../src/sc/wishlist-page";

type Fields = Record<string, unknown>;

function product(fields: Fields = {}): Fields {
  return {
    id: 1001,
    title: "Titre Synthetique",
    originalTitle: null,
    url: "/serie/titre_synthetique/1001",
    universe: 4,
    dateRelease: null,
    originalRun: null,
    yearOfProduction: null,
    displayedYear: null,
    ...fields,
  };
}

function response(products: unknown, total?: unknown): unknown {
  const collection: Fields = { products, __typename: "Collection" };
  if (total !== undefined) collection.total = total;
  return { data: { user: { collection } } };
}

function onlyItem(fields: Fields) {
  const { items } = parseWishlistPage(response([product(fields)], 1));
  expect(items).toHaveLength(1);
  return items[0];
}

describe("parseWishlistPage year", () => {
  it("prefers dateRelease over originalRun", () => {
    const item = onlyItem({
      dateRelease: "2026-10-17",
      originalRun: "1999-05-01",
      yearOfProduction: 2004,
      displayedYear: 1980,
    });
    expect(item?.year).toBe(2026);
  });

  it("falls back on originalRun", () => {
    expect(onlyItem({ originalRun: "1999-05-01" })?.year).toBe(1999);
  });

  it("falls back on yearOfProduction", () => {
    expect(onlyItem({ yearOfProduction: 2004 })?.year).toBe(2004);
  });

  it("prefers originalRun over yearOfProduction", () => {
    expect(
      onlyItem({ originalRun: "1999-05-01", yearOfProduction: 2004 })?.year,
    ).toBe(1999);
  });

  it("prefers yearOfProduction over displayedYear", () => {
    expect(
      onlyItem({ yearOfProduction: 2004, displayedYear: 1980 })?.year,
    ).toBe(2004);
  });

  it("falls back on a numeric displayedYear", () => {
    expect(onlyItem({ displayedYear: 1980 })?.year).toBe(1980);
  });

  it("falls back on a string displayedYear starting with 4 digits", () => {
    expect(onlyItem({ displayedYear: "1975-2001" })?.year).toBe(1975);
  });

  it("has no year key when nothing gives one", () => {
    const item = onlyItem({});
    expect(item).toBeDefined();
    expect(item && "year" in item).toBe(false);
  });

  it("skips an invalid dateRelease and uses the next source", () => {
    expect(
      onlyItem({ dateRelease: "20x6-10-17", originalRun: "1999-05-01" })?.year,
    ).toBe(1999);
  });

  it("skips a too short dateRelease", () => {
    expect(onlyItem({ dateRelease: "199", yearOfProduction: 2004 })?.year).toBe(
      2004,
    );
  });

  it("skips a non-string dateRelease", () => {
    expect(
      onlyItem({ dateRelease: 2026, originalRun: "1999-05-01" })?.year,
    ).toBe(1999);
  });

  it("skips an invalid originalRun", () => {
    expect(
      onlyItem({ originalRun: "abcd-05-01", yearOfProduction: 2004 })?.year,
    ).toBe(2004);
  });

  it("skips a non-string originalRun", () => {
    expect(onlyItem({ originalRun: 1999, yearOfProduction: 2004 })?.year).toBe(
      2004,
    );
  });

  it("rejects a non-integer yearOfProduction", () => {
    expect(
      onlyItem({ yearOfProduction: 2004.5, displayedYear: 1980 })?.year,
    ).toBe(1980);
  });

  it("rejects a string yearOfProduction", () => {
    expect(
      onlyItem({ yearOfProduction: "2004", displayedYear: 1980 })?.year,
    ).toBe(1980);
  });

  it("rejects yearOfProduction below 1800 but accepts 1800", () => {
    expect(
      onlyItem({ yearOfProduction: 1799, displayedYear: 1980 })?.year,
    ).toBe(1980);
    expect(onlyItem({ yearOfProduction: 1800 })?.year).toBe(1800);
  });

  it("rejects yearOfProduction above 2100 but accepts 2100", () => {
    expect(
      onlyItem({ yearOfProduction: 2101, displayedYear: 1980 })?.year,
    ).toBe(1980);
    expect(onlyItem({ yearOfProduction: 2100 })?.year).toBe(2100);
  });

  it("rejects an out-of-range numeric displayedYear", () => {
    expect(onlyItem({ displayedYear: 1799 })?.year).toBeUndefined();
    expect(onlyItem({ displayedYear: 2101 })?.year).toBeUndefined();
    expect(onlyItem({ displayedYear: 1999.5 })?.year).toBeUndefined();
  });

  it("rejects a displayedYear string without 4 leading digits", () => {
    expect(onlyItem({ displayedYear: "ca. 1975" })?.year).toBeUndefined();
    expect(onlyItem({ displayedYear: "197" })?.year).toBeUndefined();
  });

  it("rejects a displayedYear of another type", () => {
    expect(onlyItem({ displayedYear: true })?.year).toBeUndefined();
  });

  it.each(["dateRelease", "originalRun", "displayedYear"])(
    "bounds a year taken from the %s date to 1800..2100",
    (field) => {
      for (const date of [
        "0000-01-01",
        "1799-12-31",
        "2101-01-01",
        "9999-12-31",
      ]) {
        const item = onlyItem({ [field]: date });
        expect(item && "year" in item).toBe(false);
      }
      expect(onlyItem({ [field]: "1800-01-01" })?.year).toBe(1800);
      expect(onlyItem({ [field]: "2100-12-31" })?.year).toBe(2100);
    },
  );

  it("skips an out-of-range dateRelease and uses the next source", () => {
    expect(
      onlyItem({ dateRelease: "0000-01-01", originalRun: "1999-05-01" })?.year,
    ).toBe(1999);
  });

  it("an out-of-range date year never reaches the matcher", () => {
    const item = onlyItem({ dateRelease: "9999-01-01" });
    const titled = item && scToTitled(item);
    expect(titled).toEqual({ title: "Titre Synthetique", type: "serie" });
  });
});

describe("parseWishlistPage items", () => {
  it("maps the fields of a product", () => {
    const parsed = parseWishlistPage(
      response(
        [
          product({
            id: 2002,
            title: "Un Film Invente",
            originalTitle: "An Invented Film",
            url: "/film/un_film_invente/2002",
            universe: 1,
            dateRelease: "2026-10-17",
          }),
        ],
        40,
      ),
    );
    expect(parsed).toEqual({
      items: [
        {
          productId: 2002,
          title: "Un Film Invente",
          originalTitle: "An Invented Film",
          url: "/film/un_film_invente/2002",
          year: 2026,
          universe: 1,
        },
      ],
      total: 40,
    });
  });

  it("omits originalTitle when null, empty or absent", () => {
    for (const originalTitle of [null, ""]) {
      const item = onlyItem({ originalTitle });
      expect(item && "originalTitle" in item).toBe(false);
    }
    const { originalTitle: _removed, ...rest } = product();
    const { items } = parseWishlistPage(response([rest], 1));
    expect(items[0] && "originalTitle" in items[0]).toBe(false);
  });

  it("omits originalTitle when it is not a string", () => {
    const item = onlyItem({ originalTitle: 42 });
    expect(item && "originalTitle" in item).toBe(false);
  });

  it("skips a product without id", () => {
    const { id: _id, ...noId } = product();
    const parsed = parseWishlistPage(response([noId, product({ id: 7 })], 2));
    expect(parsed.items.map((i) => i.productId)).toEqual([7]);
  });

  it("skips a product with a non-numeric id", () => {
    const parsed = parseWishlistPage(
      response([product({ id: "1001" }), product({ id: 7 })], 2),
    );
    expect(parsed.items.map((i) => i.productId)).toEqual([7]);
  });

  it.each([1.5, -3, 0, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY])(
    "skips a product whose id %s is not a positive safe integer",
    (id) => {
      const parsed = parseWishlistPage(
        response([product({ id }), product({ id: 7 })], 2),
      );
      expect(parsed.items.map((i) => i.productId)).toEqual([7]);
    },
  );

  it("keeps the smallest id, 1", () => {
    expect(onlyItem({ id: 1 })?.productId).toBe(1);
  });

  it("skips a product without a string title", () => {
    const parsed = parseWishlistPage(
      response(
        [product({ title: null }), product({ title: 5 }), product({ id: 7 })],
        3,
      ),
    );
    expect(parsed.items.map((i) => i.productId)).toEqual([7]);
  });

  it("skips a product without a string url", () => {
    const parsed = parseWishlistPage(
      response(
        [product({ url: null }), product({ url: 5 }), product({ id: 7 })],
        3,
      ),
    );
    expect(parsed.items.map((i) => i.productId)).toEqual([7]);
  });

  it("keeps a product with an empty title", () => {
    expect(onlyItem({ title: "" })?.title).toBe("");
  });

  it("skips non-object products", () => {
    const parsed = parseWishlistPage(
      response([null, "x", 3, product({ id: 7 })], 4),
    );
    expect(parsed.items.map((i) => i.productId)).toEqual([7]);
  });

  it("keeps the order of the products", () => {
    const parsed = parseWishlistPage(
      response([product({ id: 3 }), product({ id: 1 }), product({ id: 2 })], 3),
    );
    expect(parsed.items.map((i) => i.productId)).toEqual([3, 1, 2]);
  });

  it("copies a numeric or string universe", () => {
    expect(onlyItem({ universe: 1 })?.universe).toBe(1);
    expect(onlyItem({ universe: "4" })?.universe).toBe("4");
  });

  it("keeps the item with an empty universe when it is missing or odd", () => {
    expect(onlyItem({ universe: null })?.universe).toBe("");
    expect(onlyItem({ universe: undefined })?.universe).toBe("");
    expect(onlyItem({ universe: true })?.universe).toBe("");
  });
});

describe("parseWishlistPage totals and bad shapes", () => {
  it("reads the collection total", () => {
    expect(parseWishlistPage(response([product()], 40)).total).toBe(40);
  });

  it("accepts a total of 0", () => {
    expect(parseWishlistPage(response([product()], 0)).total).toBe(0);
  });

  it("falls back on the item count for a missing total", () => {
    const parsed = parseWishlistPage(response([product(), product({ id: 2 })]));
    expect(parsed.total).toBe(2);
  });

  it("falls back on the item count for an invalid total", () => {
    const products = [product(), product({ id: 2 })];
    for (const total of [-1, 1.5, "40", null, Number.NaN]) {
      expect(parseWishlistPage(response(products, total)).total).toBe(2);
    }
  });

  it("counts only the parsed items in the fallback", () => {
    const parsed = parseWishlistPage(response([product(), { id: 5 }]));
    expect(parsed.total).toBe(1);
  });

  it("never throws and gives an empty result on unexpected shapes", () => {
    const empty = { items: [], total: 0 };
    const shapes: unknown[] = [
      {},
      null,
      undefined,
      "x",
      42,
      [],
      { data: null },
      { data: {} },
      { data: { user: null } },
      { data: { user: {} } },
      { data: { user: { collection: null } } },
      { data: { user: { collection: {} } } },
      response("nope"),
      response({ 0: product() }),
      response(null),
    ];
    for (const shape of shapes) {
      expect(parseWishlistPage(shape)).toEqual(empty);
    }
  });

  it("keeps a valid total when the products are unreadable", () => {
    expect(parseWishlistPage(response("nope", 12))).toEqual({
      items: [],
      total: 12,
    });
  });
});

describe("nextOffset", () => {
  it("returns the following offset while below the total", () => {
    expect(nextOffset(0, 18, 40)).toBe(18);
    expect(nextOffset(18, 18, 40)).toBe(36);
  });

  it("returns undefined on the last page", () => {
    expect(nextOffset(36, 18, 40)).toBeUndefined();
    expect(nextOffset(0, 18, 18)).toBeUndefined();
  });

  it("returns undefined when the next offset equals the total", () => {
    expect(nextOffset(18, 18, 36)).toBeUndefined();
  });

  it("returns the next offset when it is one below the total", () => {
    expect(nextOffset(0, 18, 19)).toBe(18);
  });

  it("returns undefined for a limit of 0 or less", () => {
    expect(nextOffset(0, 0, 40)).toBeUndefined();
    expect(nextOffset(0, -18, 40)).toBeUndefined();
  });

  it("returns undefined for a negative offset", () => {
    expect(nextOffset(-18, 36, 40)).toBeUndefined();
    expect(nextOffset(-1, 18, 40)).toBeUndefined();
  });

  it("accepts a limit of 1", () => {
    expect(nextOffset(0, 1, 40)).toBe(1);
  });

  it("returns undefined for a non-integer argument", () => {
    expect(nextOffset(0.5, 18, 40)).toBeUndefined();
    expect(nextOffset(0, 18.5, 40)).toBeUndefined();
    expect(nextOffset(0, 18, 40.5)).toBeUndefined();
    expect(nextOffset(Number.NaN, 18, 40)).toBeUndefined();
    expect(nextOffset(0, Number.POSITIVE_INFINITY, 40)).toBeUndefined();
    expect(nextOffset(0, 18, Number.NaN)).toBeUndefined();
  });
});
