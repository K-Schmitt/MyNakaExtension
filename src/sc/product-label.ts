// The public title and year of a product, read from a ProductCurrentUserInfos answer for the preview. Lenient
// and NEVER throwing, since it reads an answer the caller needs for more than the label: an unexpected value
// only drops the label, or its year, never the state the caller needs for a finish or a live addition.

import { MAX_YEAR, MIN_YEAR } from "../core/year-range";

export type ProductLabel = { title: string; year?: number };

const LEADING_YEAR = /^(\d{4})(?:-|$)/;

// Where the year may be, most reliable first; all are in the recorded query.
const YEAR_FIELDS = ["dateRelease", "originalRun", "yearOfProduction"] as const;

function inRange(year: number): number | undefined {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR
    ? year
    : undefined;
}

function yearOf(value: unknown): number | undefined {
  if (typeof value === "number") return inRange(value);
  if (typeof value !== "string") return undefined;
  const match = LEADING_YEAR.exec(value);
  return match?.[1] === undefined ? undefined : inRange(Number(match[1]));
}

function firstYear(product: Record<string, unknown>): number | undefined {
  for (const field of YEAR_FIELDS) {
    const year = yearOf(product[field]);
    if (year !== undefined) return year;
  }
  return undefined;
}

function labelOf(product: Record<string, unknown>): ProductLabel | undefined {
  const { title } = product;
  if (typeof title !== "string" || title === "") return undefined;
  const year = firstYear(product);
  return year === undefined ? { title } : { title, year };
}

export function readProductLabel(
  product: Record<string, unknown>,
): ProductLabel | undefined {
  try {
    return labelOf(product);
  } catch {
    return undefined;
  }
}
