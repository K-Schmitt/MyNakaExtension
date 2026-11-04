// The owner's calendar day, as SensCritique records the date a title was seen (YYYY-MM-DD). It is read in
// the local time zone: a slice of an ISO string is the UTC day, a day off around midnight.

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

export function localDate(date: Date): string {
  const year = pad(date.getFullYear(), 4);
  const month = pad(date.getMonth() + 1, 2);
  return `${year}-${month}-${pad(date.getDate(), 2)}`;
}
