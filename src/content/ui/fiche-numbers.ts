// The numbers the title page UI reads from Naka's page and writes in French: an episode's number from its
// box's code, the season its dropdown names, a SensCritique average with a decimal comma.

const TRAILING_NUMBER = /(\d+)\s*$/;
const SEASON_LABEL = /saison\s*(\d+)/i;

function positiveInt(digits: string | undefined): number | undefined {
  const value = Number(digits);
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

/** The number that ends `span.dcf-ep-code` (« S1 E3 » → 3); undefined when the code has none. */
export function episodeNumber(
  code: string | null | undefined,
): number | undefined {
  const match = TRAILING_NUMBER.exec(code ?? "");
  return match === null ? undefined : positiveInt(match[1]);
}

/** The season the dropdown names (« Saison 2 » → 2). */
export function seasonNumber(
  label: string | null | undefined,
): number | undefined {
  const match = SEASON_LABEL.exec(label ?? "");
  return match === null ? undefined : positiveInt(match[1]);
}

/** An average as SensCritique shows it: one decimal at most, a decimal comma (6.9 → « 6,9 », 7 → « 7 »). */
export function frenchAverage(average: number): string {
  return String(Math.round(average * 10) / 10).replace(".", ",");
}
