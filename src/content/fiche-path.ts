// The tab's own address of a Naka title page, /content/{movie|tv}/{tmdbId}: the controller follows the
// title it names, never one a page event names.

export type TitlePath = { mediaType: "movie" | "tv"; tmdbId: number };

const TITLE_PATH = /^\/content\/(movie|tv)\/([1-9][0-9]*)$/;

export function parseTitlePath(pathname: string): TitlePath | undefined {
  const match = TITLE_PATH.exec(pathname);
  if (match === null) return undefined;
  const tmdbId = Number(match[2]);
  if (!Number.isSafeInteger(tmdbId)) return undefined;
  return { mediaType: match[1] === "tv" ? "tv" : "movie", tmdbId };
}
