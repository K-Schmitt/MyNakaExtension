// The title page messages a Naka tab sends the worker. The tab is a page the owner does not control: ids
// are positive safe integers, texts are capped, a rating is 1 to 10, and any other key refuses the message.
// The worker still writes only a product it issued to this tab (fiche-registry), after a trusted click.

import { asText, asYear } from "./fiche-page-events";
import {
  asId,
  asOneOf,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";
import type { SenderRole } from "./messages";
import { asRating } from "./rating-schema";

export type FicheTarget = "film" | "série" | "épisode";

export type FicheMessage =
  | {
      type: "fiche-info";
      contentId: number;
      mediaType: "movie" | "tv";
      title: string;
      originalTitle?: string;
      year?: number;
    }
  | { type: "fiche-season"; contentId: number; season: number }
  | { type: "fiche-mine"; contentId: number; productId: number }
  | {
      type: "fiche-rate";
      contentId: number;
      target: FicheTarget;
      productId: number;
      rating: number;
      season?: number;
      episode?: number;
    }
  | { type: "fiche-link"; contentId: number; productId: number };

export type FicheType = FicheMessage["type"];
export type FicheInfoMessage = Extract<FicheMessage, { type: "fiche-info" }>;
export type FicheSeasonMessage = Extract<
  FicheMessage,
  { type: "fiche-season" }
>;
export type FicheMineMessage = Extract<FicheMessage, { type: "fiche-mine" }>;
export type FicheRateMessage = Extract<FicheMessage, { type: "fiche-rate" }>;
export type FicheLinkMessage = Extract<FicheMessage, { type: "fiche-link" }>;

/** Spread into the worker's type list (messages.ts). */
export const FICHE_TYPE_FLAGS: Record<FicheType, true> = {
  "fiche-info": true,
  "fiche-season": true,
  "fiche-mine": true,
  "fiche-rate": true,
  "fiche-link": true,
};
const FICHE_TYPES = valuesOf<FicheType>(FICHE_TYPE_FLAGS);

export const FICHE_SENDERS: Record<FicheType, readonly SenderRole[]> = {
  "fiche-info": ["naka-tab"],
  "fiche-season": ["naka-tab"],
  "fiche-mine": ["naka-tab"],
  "fiche-rate": ["naka-tab"],
  "fiche-link": ["naka-tab"],
};

const TARGETS = valuesOf<FicheTarget>({
  film: true,
  série: true,
  épisode: true,
});
const MEDIA_TYPES = valuesOf<FicheInfoMessage["mediaType"]>({
  movie: true,
  tv: true,
});
const INFO_KEYS = valuesOf<keyof FicheInfoMessage>({
  type: true,
  contentId: true,
  mediaType: true,
  title: true,
  originalTitle: true,
  year: true,
});
const SEASON_KEYS = valuesOf<keyof FicheSeasonMessage>({
  type: true,
  contentId: true,
  season: true,
});
const PRODUCT_KEYS = valuesOf<keyof FicheMineMessage>({
  type: true,
  contentId: true,
  productId: true,
});
const RATE_KEYS = valuesOf<keyof FicheRateMessage>({
  type: true,
  contentId: true,
  target: true,
  productId: true,
  rating: true,
  season: true,
  episode: true,
});

export function isFicheType(type: string): type is FicheType {
  return FICHE_TYPES.some((known) => known === type);
}

function parseInfo(record: Record<string, unknown>): FicheInfoMessage {
  onlyKeys(record, INFO_KEYS, "message");
  const message: FicheInfoMessage = {
    type: "fiche-info",
    contentId: asId(record.contentId, "contentId"),
    mediaType: asOneOf(record.mediaType, MEDIA_TYPES, "mediaType"),
    title: asText(record.title, "title"),
  };
  const originalTitle = whenPresent(record.originalTitle, (v) =>
    asText(v, "originalTitle"),
  );
  const year = whenPresent(record.year, asYear);
  if (originalTitle !== undefined) message.originalTitle = originalTitle;
  if (year !== undefined) message.year = year;
  return message;
}

function parseRate(record: Record<string, unknown>): FicheRateMessage {
  onlyKeys(record, RATE_KEYS, "message");
  const target = asOneOf(record.target, TARGETS, "target");
  const base = {
    type: "fiche-rate" as const,
    contentId: asId(record.contentId, "contentId"),
    target,
    productId: asId(record.productId, "productId"),
    rating: asRating(record.rating, "rating"),
  };
  const place = target === "épisode";
  const hasPlace = record.season !== undefined || record.episode !== undefined;
  if (!place) return hasPlace ? fail("season") : base;
  return {
    ...base,
    season: asId(record.season, "season"),
    episode: asId(record.episode, "episode"),
  };
}

function parseProduct(
  type: "fiche-mine" | "fiche-link",
  record: Record<string, unknown>,
): FicheMineMessage | FicheLinkMessage {
  onlyKeys(record, PRODUCT_KEYS, "message");
  return {
    type,
    contentId: asId(record.contentId, "contentId"),
    productId: asId(record.productId, "productId"),
  };
}

export function parseFicheMessage(
  type: FicheType,
  record: Record<string, unknown>,
): FicheMessage {
  switch (type) {
    case "fiche-info":
      return parseInfo(record);
    case "fiche-season":
      onlyKeys(record, SEASON_KEYS, "message");
      return {
        type,
        contentId: asId(record.contentId, "contentId"),
        season: asId(record.season, "season"),
      };
    case "fiche-rate":
      return parseRate(record);
    default:
      return parseProduct(type, record);
  }
}
