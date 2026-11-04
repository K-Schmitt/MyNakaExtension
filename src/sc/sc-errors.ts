// Errors of the SensCritique client. Their messages never carry the auth token nor a response body.

// The service cannot be read: HTTP not 200, a body that is not JSON (a challenge page), GraphQL errors,
// or a page that cannot be trusted to be complete.
export class ScUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScUnavailableError";
  }
}

// No token, no username, or a GraphQL "Unauthenticated" error: the owner has to log in again.
export class ScUnauthenticatedError extends ScUnavailableError {
  constructor() {
    super("Not logged in to SensCritique: log in again on senscritique.com");
    this.name = "ScUnauthenticatedError";
  }
}
