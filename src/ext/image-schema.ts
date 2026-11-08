// The image of a stored or answered record. Shape only: a TMDB path or an https URL. The host allowlist
// applies when an image enters from a site and when it is drawn, never here, so a later change of the
// list cannot make stored state unreadable.

import type { TitleImage } from "../core/title-image";
import {
  asRecord,
  asString,
  fail,
  onlyKeys,
  valuesOf,
  whenPresent,
} from "./field-checks";

const IMAGE_KEYS = valuesOf<keyof TitleImage>({
  posterPath: true,
  backdropPath: true,
  picture: true,
});
const TMDB_PATH = /^\/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$/;

function asTmdbPath(raw: unknown, path: string): string {
  const value = asString(raw, path);
  return TMDB_PATH.test(value) ? value : fail(path);
}

function asHttpsUrl(raw: unknown, path: string): string {
  const value = asString(raw, path);
  try {
    return new URL(value).protocol === "https:" ? value : fail(path);
  } catch {
    return fail(path);
  }
}

export function parseTitleImage(raw: unknown, path: string): TitleImage {
  const record = asRecord(raw, path);
  onlyKeys(record, IMAGE_KEYS, path);
  const posterPath = whenPresent(record.posterPath, (v) =>
    asTmdbPath(v, `${path}.posterPath`),
  );
  const backdropPath = whenPresent(record.backdropPath, (v) =>
    asTmdbPath(v, `${path}.backdropPath`),
  );
  const picture = whenPresent(record.picture, (v) =>
    asHttpsUrl(v, `${path}.picture`),
  );
  if (!posterPath && !backdropPath && !picture) return fail(path);
  return {
    ...(posterPath && { posterPath }),
    ...(backdropPath && { backdropPath }),
    ...(picture && { picture }),
  };
}

/** `{ image }` when the record holds one, else `{}`. */
export function optionalImage(
  record: Record<string, unknown>,
  path: string,
): { image?: TitleImage } {
  const image = whenPresent(record.image, (v) =>
    parseTitleImage(v, `${path}.image`),
  );
  return image === undefined ? {} : { image };
}
