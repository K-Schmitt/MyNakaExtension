// Adapters from the Naka and SensCritique item shapes to the shapes the matcher reads.
// Optional fields are omitted when absent, and nothing but the matcher's fields is copied.

import type { NakaItem } from "../naka/naka-items";
import { UNIVERSE } from "../sc/sc-queries";
import type { ScWishItem } from "../sc/wishlist-page";
import type { Candidate, MediaType, Titled } from "./title-match";

const YEAR_PREFIX = /^\d{4}/;
const MIN_YEAR = 1800;
const MAX_YEAR = 2100;

function nakaType(mediaType: NakaItem["mediaType"]): MediaType {
  switch (mediaType) {
    case "tv":
      return "serie";
    case "movie":
      return "film";
  }
}

function yearOf(releaseDate: string | undefined): number | undefined {
  if (releaseDate === undefined || !YEAR_PREFIX.test(releaseDate)) {
    return undefined;
  }
  const year = Number(releaseDate.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : undefined;
}

function urlType(url: string): MediaType | undefined {
  if (url.startsWith("/serie/")) return "serie";
  if (url.startsWith("/film/")) return "film";
  return undefined;
}

function universeType(universe: number): MediaType | undefined {
  if (universe === UNIVERSE.serie) return "serie";
  if (universe === UNIVERSE.film) return "film";
  return undefined;
}

// A numeric universe decides alone: a season (5) or an episode (32) has a /serie/ url but is never a
// series candidate. The url prefix is read only when the universe is not a number.
function scType(item: ScWishItem): MediaType | undefined {
  if (typeof item.universe === "number") return universeType(item.universe);
  return urlType(item.url);
}

function build(
  title: string,
  type: MediaType,
  originalTitle: string | undefined,
  year: number | undefined,
): Titled {
  const titled: Titled = { title, type };
  if (originalTitle !== undefined && originalTitle !== "") {
    titled.originalTitle = originalTitle;
  }
  if (year !== undefined) titled.year = year;
  return titled;
}

export function nakaToTitled(item: NakaItem): Titled {
  return build(
    item.title,
    nakaType(item.mediaType),
    item.originalTitle,
    yearOf(item.releaseDate),
  );
}

export function nakaToCandidate(item: NakaItem): Candidate {
  return { ...nakaToTitled(item), id: item.contentId };
}

// undefined when the universe (or, without a numeric universe, the url) names neither a film nor a series.
export function scToTitled(item: ScWishItem): Titled | undefined {
  const type = scType(item);
  if (type === undefined) return undefined;
  return build(item.title, type, item.originalTitle, item.year);
}

export function scToCandidate(item: ScWishItem): Candidate | undefined {
  const titled = scToTitled(item);
  if (titled === undefined) return undefined;
  return { ...titled, id: item.productId };
}
