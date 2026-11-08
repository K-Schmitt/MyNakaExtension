import { scPictureOf } from "./image-urls";

export type TitleImage = {
  posterPath?: string;
  backdropPath?: string;
  picture?: string;
};

const TMDB_PATH = /^\/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$/;

export function tmdbPathOf(value: unknown): string | undefined {
  return typeof value === "string" && TMDB_PATH.test(value) ? value : undefined;
}

export function imageOf(fields: {
  posterPath?: unknown;
  backdropPath?: unknown;
  picture?: unknown;
}): TitleImage | undefined {
  const posterPath = tmdbPathOf(fields.posterPath);
  const backdropPath = tmdbPathOf(fields.backdropPath);
  const picture = scPictureOf(fields.picture);
  if (!posterPath && !backdropPath && !picture) return undefined;
  return {
    ...(posterPath && { posterPath }),
    ...(backdropPath && { backdropPath }),
    ...(picture && { picture }),
  };
}
