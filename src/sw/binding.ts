// The accounts a job acts for. The first successful run binds the SensCritique username and the Naka
// account; afterwards a job signed in as anyone else stops before it loads or writes anything.

import { JobRejected } from "../ext/job-error";
import type { Settings } from "../ext/settings";
import { ScUnauthenticatedError } from "../sc/sc-errors";
import { readSession, type ScDeps } from "../sc/sc-transport";

export type Binding = NonNullable<Settings["binding"]>;
export type Accounts = { scUsername: string; nakaAccount: string };
export type AccountReaders = {
  nakaAccount(): Promise<string | undefined>;
  scUsername(): Promise<string>;
};

// Only the username is taken from the session: the token in it is never bound to a name here.
export async function readScUsername(deps: ScDeps): Promise<string> {
  const { username } = await readSession(deps);
  if (username === undefined) throw new ScUnauthenticatedError();
  return username;
}

// A Naka tab with no readable account is logged out.
async function readAccounts(readers: AccountReaders): Promise<Accounts> {
  const nakaAccount = await readers.nakaAccount();
  if (nakaAccount === undefined) throw new JobRejected("naka-session");
  return { scUsername: await readers.scUsername(), nakaAccount };
}

// A binding made before the Naka account was known binds the SensCritique side only.
export function isBoundElsewhere(
  binding: Binding | undefined,
  accounts: Accounts,
): boolean {
  if (binding === undefined) return false;
  if (binding.scUsername !== accounts.scUsername) return true;
  return (
    binding.nakaAccount !== undefined &&
    binding.nakaAccount !== accounts.nakaAccount
  );
}

export async function checkBinding(
  binding: Binding | undefined,
  readers: AccountReaders,
): Promise<Accounts> {
  const accounts = await readAccounts(readers);
  if (isBoundElsewhere(binding, accounts)) {
    throw new JobRejected("other-account");
  }
  return accounts;
}
