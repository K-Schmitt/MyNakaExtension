// How the page writes a moment: the owner's local time, in French. The zone is injectable for tests.

export type StatusFormat = {
  dateTime(at: number): string;
  date(at: number): string;
  time(at: number): string;
};

const LOCALE = "fr-FR";

// Without a zone, Intl uses the owner's own.
export function localFormat(timeZone?: string): StatusFormat {
  const clock = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const day = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return {
    dateTime: (at) => `${day.format(at)} ${clock.format(at)}`,
    date: (at) => day.format(at),
    time: (at) => clock.format(at),
  };
}
