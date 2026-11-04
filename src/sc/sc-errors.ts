// Errors of the SensCritique client. Their messages never carry the auth token nor a response body.

// The service cannot be read: HTTP not 200, a body that is not JSON (a challenge page), GraphQL errors,
// or a page that cannot be trusted to be complete.
export class ScUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScUnavailableError";
  }
}

// A request the worker's 30 s timer aborted (Ruling 16). Its text names the operation and the timeout
// only. Like a 429, it opens the port's breaker (K4): a site that stopped answering costs one timeout
// per port, not one per call.
export class ScTimeoutError extends ScUnavailableError {
  constructor(label: string) {
    super(`SensCritique ${label}: timeout`);
    this.name = "ScTimeoutError";
  }
}

// No token, no username, or a GraphQL "Unauthenticated" error: the owner has to log in again.
export class ScUnauthenticatedError extends ScUnavailableError {
  constructor() {
    super("Not logged in to SensCritique: log in again on senscritique.com");
    this.name = "ScUnauthenticatedError";
  }
}
