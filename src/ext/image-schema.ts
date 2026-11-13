// The image of a stored or answered record. Shape only: a TMDB path or an https URL. The host allowlist
// applies when an image enters from a site and when it is drawn, never here, so a later change of the
// list cannot make stored state unreadable. The TMDB path rule is the entry's, and it may tighten after a
// path was stored: a path it no longer accepts drops, with the image when nothing else is left, never
// the record that holds it.

import { type TitleImage, tmdbPathOf } from "../core/title-image";
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

/** The path when the entry rule still accepts it, else undefined; a non-string is the wrong shape. */
function keptTmdbPath(raw: unknown, path: string): string | undefined {
  return tmdbPathOf(asString(raw, path));
}

function asHttpsUrl(raw: unknown, path: string): string {
  const value = asString(raw, path);
  try {
    return new URL(value).protocol === "https:" ? value : fail(path);
  } catch {
    return fail(path);
  }
}

/** The image, or undefined when every path it held was dropped; an image with no field is the wrong shape. */
export function parseTitleImage(
  raw: unknown,
  path: string,
): TitleImage | undefined {
  const record = asRecord(raw, path);
  onlyKeys(record, IMAGE_KEYS, path);
  if (Object.keys(record).length === 0) return fail(path);
  const posterPath = whenPresent(record.posterPath, (v) =>
    keptTmdbPath(v, `${path}.posterPath`),
  );
  const backdropPath = whenPresent(record.backdropPath, (v) =>
    keptTmdbPath(v, `${path}.backdropPath`),
  );
  const picture = whenPresent(record.picture, (v) =>
    asHttpsUrl(v, `${path}.picture`),
  );
  if (!posterPath && !backdropPath && !picture) return undefined;
  return {
    ...(posterPath && { posterPath }),
    ...(backdropPath && { backdropPath }),
    ...(picture && { picture }),
  };
}

/** `{ image }` when the record holds one that still reads, else `{}`. */
export function optionalImage(
  record: Record<string, unknown>,
  path: string,
): { image?: TitleImage } {
  const image = whenPresent(record.image, (v) =>
    parseTitleImage(v, `${path}.image`),
  );
  return image === undefined ? {} : { image };
}
