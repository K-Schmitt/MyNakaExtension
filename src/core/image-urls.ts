import type { TitleImage } from "./title-image";

// From the owner's H2 probe of 2026-11-08: SensCritique's `medias.picture` is a full
// https://media.senscritique.com/media/…/300/… address. Lowercase hosts only (URL.hostname is lowercased).
export const SC_IMAGE_HOSTS: readonly string[] = ["media.senscritique.com"];

const TMDB_HOST = "image.tmdb.org";
const TMDB_BASE = `https://${TMDB_HOST}/t/p`;

function parseHttps(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

export function scPictureOf(
  value: unknown,
  hosts: readonly string[] = SC_IMAGE_HOSTS,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = parseHttps(value);
  return url && hosts.includes(url.hostname) ? url.href : undefined;
}

export function thumbUrl(image?: TitleImage): string | undefined {
  if (image?.posterPath) return `${TMDB_BASE}/w92${image.posterPath}`;
  return image?.picture;
}

export function wideUrl(image?: TitleImage): string | undefined {
  if (image?.backdropPath) return `${TMDB_BASE}/w780${image.backdropPath}`;
  if (image?.posterPath) return `${TMDB_BASE}/w500${image.posterPath}`;
  return image?.picture;
}

export function isShownImageUrl(
  url: string,
  hosts: readonly string[] = SC_IMAGE_HOSTS,
): boolean {
  const parsed = parseHttps(url);
  return (
    !!parsed &&
    (parsed.hostname === TMDB_HOST || hosts.includes(parsed.hostname))
  );
}
