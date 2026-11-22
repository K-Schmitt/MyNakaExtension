// The numbers the title page UI reads from Naka's page and writes in French: an episode's number from its
// box's code, the season its dropdown names, a SensCritique average with a decimal comma.

const TRAILING_NUMBER = /(\d+)$/;
// The end of a code the number is read in: past a safe integer's 16 digits, so a run of digits cut here is
// no safe number either way, and the read stays short on any page text.
const CODE_TAIL = 20;
const SEASON_LABEL = /saison\s*(\d+)/i;

function positiveInt(digits: string | undefined): number | undefined {
  const value = Number(digits);
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

/** The number that ends `span.nh-ep-num` (« 12 » → 12); undefined when the code has none. */
export function episodeNumber(
  code: string | null | undefined,
): number | undefined {
  const tail = (code ?? "").trimEnd().slice(-CODE_TAIL);
  const match = TRAILING_NUMBER.exec(tail);
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
