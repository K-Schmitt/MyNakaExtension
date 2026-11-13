// The title page inputs as the Naka tab calls them: a throw in the title page controller stays there, so
// that it never skips the playback tracking or the other blocks the same poll or page message serves.

import type { FicheInput } from "./fiche-ports";

function guarded<A>(act: (arg: A) => void): (arg: A) => void {
  return (arg) => {
    try {
      act(arg);
    } catch {
      // The title page shows nothing new; the tab goes on.
    }
  };
}

export function guardFicheInput(input: FicheInput): FicheInput {
  return {
    path: guarded((pathname: string) => input.path(pathname)),
    event: guarded((event: Parameters<FicheInput["event"]>[0]) =>
      input.event(event),
    ),
  };
}
