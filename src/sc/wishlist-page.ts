// Parses one page of the response of SensCritique's `UserCollection` GraphQL query (the wishlist).
// Pure: no network. An unreadable page gives an empty result, never a throw.
// An item is dropped only when it lacks a positive safe integer id, a string title or a string url;
// the reader (sc-wishlist.ts) rejects a page with a dropped item, so a dropped item never shortens a list.

export type ScWishItem = {
  productId: number;
  title: string;
  originalTitle?: string;
  url: string;
  year?: number;
  /** Absent when SensCritique gives none (missing or null); "" for a value neither number nor string. */
  universe?: number | string;
};

type WishlistPage = { items: ScWishItem[]; total: number };
type Fields = Record<string, unknown>;

const YEAR_PREFIX = /^\d{4}/;
const MIN_YEAR = 1800;
const MAX_YEAR = 2100;

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

function collectionOf(json: unknown): Fields | undefined {
  if (!isRecord(json)) return undefined;
  const data = json.data;
  if (!isRecord(data)) return undefined;
  const user = data.user;
  if (!isRecord(user)) return undefined;
  const collection = user.collection;
  return isRecord(collection) ? collection : undefined;
}

function inYearRange(year: number): number | undefined {
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : undefined;
}

function yearFromDate(value: unknown): number | undefined {
  if (typeof value !== "string" || !YEAR_PREFIX.test(value)) return undefined;
  return inYearRange(Number(value.slice(0, 4)));
}

function yearFromNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return inYearRange(value);
}

function yearFromDisplayed(value: unknown): number | undefined {
  if (typeof value === "string") return yearFromDate(value);
  return yearFromNumber(value);
}

function yearOf(fields: Fields): number | undefined {
  return (
    yearFromDate(fields.dateRelease) ??
    yearFromDate(fields.originalRun) ??
    yearFromNumber(fields.yearOfProduction) ??
    yearFromDisplayed(fields.displayedYear)
  );
}

function universeOf(value: unknown): number | string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "number" || typeof value === "string" ? value : "";
}

function isProductId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseWishItem(value: unknown): ScWishItem | undefined {
  if (!isRecord(value)) return undefined;
  const { id, title, url, originalTitle } = value;
  if (!isProductId(id)) return undefined;
  if (typeof title !== "string" || typeof url !== "string") return undefined;
  const item: ScWishItem = { productId: id, title, url };
  const universe = universeOf(value.universe);
  if (universe !== undefined) item.universe = universe;
  if (typeof originalTitle === "string" && originalTitle !== "") {
    item.originalTitle = originalTitle;
  }
  const year = yearOf(value);
  if (year !== undefined) item.year = year;
  return item;
}

function itemsOf(collection: Fields): ScWishItem[] {
  const products = collection.products;
  if (!Array.isArray(products)) return [];
  const items: ScWishItem[] = [];
  for (const product of products) {
    const item = parseWishItem(product);
    if (item !== undefined) items.push(item);
  }
  return items;
}

function totalOf(collection: Fields, fallback: number): number {
  const total = collection.total;
  if (typeof total === "number" && Number.isInteger(total) && total >= 0) {
    return total;
  }
  return fallback;
}

export function parseWishlistPage(json: unknown): WishlistPage {
  const collection = collectionOf(json);
  if (collection === undefined) return { items: [], total: 0 };
  const items = itemsOf(collection);
  return { items, total: totalOf(collection, items.length) };
}

export function nextOffset(
  offset: number,
  limit: number,
  total: number,
): number | undefined {
  if (![offset, limit, total].every(Number.isInteger)) return undefined;
  if (limit <= 0 || offset < 0) return undefined;
  const next = offset + limit;
  return next < total ? next : undefined;
}
