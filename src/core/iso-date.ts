// The one date check of both sites' values and of the stored records. Pure.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD in shape, as both sites give a date and the records keep it; not a calendar check. */
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}
