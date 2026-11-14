// A SensCritique product page, absolute: the origin and a path of the known shape (/{universe}/{slug}/{id},
// a season's /S{n} after it), capped in length. Pure. Both the worker (from an answer's relative path) and
// the tab's parser (from the worker's answer) hold to it, so a link the page shows only ever opens a
// SensCritique product, and a page the worker kept never fails the tab's parser.

export const SC_ORIGIN = "https://www.senscritique.com";
/** Far above any real product page; a longer string is not one. */
export const MAX_PRODUCT_URL = 300;
const PRODUCT_PATH = /^\/[a-z_]+\/[A-Za-z0-9_-]+\/\d+(\/S\d+)?$/;

export function isProductUrl(url: string): boolean {
  if (url.length > MAX_PRODUCT_URL || !url.startsWith(SC_ORIGIN)) return false;
  return PRODUCT_PATH.test(url.slice(SC_ORIGIN.length));
}

/** The absolute page of a relative path, or undefined unless it makes a product page. */
export function productUrlOf(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  const url = `${SC_ORIGIN}${path}`;
  return isProductUrl(url) ? url : undefined;
}
