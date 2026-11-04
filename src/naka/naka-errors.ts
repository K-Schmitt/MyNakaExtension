// Error of the Naka client. Its message is fixed text (operation label + HTTP status): it never carries the
// auth token nor any part of a response body, and it has no `cause`.

export class NakaUnavailableError extends Error {
  readonly status: number;

  // status: the HTTP status, or 0 for a network failure, an unreadable body or a missing/unreadable token.
  constructor(message: string, status = 0) {
    super(message);
    this.name = "NakaUnavailableError";
    this.status = status;
  }
}
