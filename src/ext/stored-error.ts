// Thrown when stored data fails validation. The message holds a fixed prefix and the field path, never a value.
export class StoredStateError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`stored state: ${path}`);
    this.name = "StoredStateError";
    this.path = path;
  }
}
