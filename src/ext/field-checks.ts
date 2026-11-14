// Checks on one stored value. Each returns the value typed, or throws a StoredStateError holding its path.
// A path names a field, never its value: stored text must not reach an error message.

import { StoredStateError } from "./stored-error";

export function fail(path: string): never {
  throw new StoredStateError(path);
}

export function asRecord(raw: unknown, path: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail(path);
  }
  return raw as Record<string, unknown>;
}

// An object holds only the listed keys. The offending key is stored text, so the error names the object.
export function onlyKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail(path);
  }
}

export function asInt(raw: unknown, min: number, path: string): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < min) {
    return fail(path);
  }
  return raw;
}

export function asId(raw: unknown, path: string): number {
  return asInt(raw, 1, path);
}

export function asString(raw: unknown, path: string): string {
  if (typeof raw !== "string") return fail(path);
  return raw;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD in shape, as both sites give a date and the records keep it; not a calendar check. */
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function asBoolean(raw: unknown, path: string): boolean {
  if (typeof raw !== "boolean") return fail(path);
  return raw;
}

// The values of a union, from a Record that names each of them once: when the union gains or loses a
// member, the Record no longer compiles, so a list that validates stored or messaged values cannot fall
// behind its type.
export function valuesOf<T extends string>(
  members: Record<NoInfer<T>, true>,
): readonly T[] {
  return Object.keys(members) as T[];
}

export function asOneOf<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  path: string,
): T {
  const found = allowed.find((value) => value === raw);
  if (found === undefined) return fail(path);
  return found;
}

// Every slot is visited by index, so a hole in a sparse array fails like any other bad item.
export function asList<T>(
  raw: unknown,
  path: string,
  parseItem: (item: unknown, itemPath: string) => T,
): T[] {
  if (!Array.isArray(raw)) return fail(path);
  const out: T[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    out.push(parseItem(raw[i], `${path}[${i}]`));
  }
  return out;
}

// An optional field: absent (or undefined) gives undefined, anything else must parse.
export function whenPresent<T>(
  raw: unknown,
  parse: (value: unknown) => T,
): T | undefined {
  return raw === undefined ? undefined : parse(raw);
}
