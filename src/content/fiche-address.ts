// Whether the tab's address still names the visit's title. The controller learns the address at a poll once a
// second: right after Naka moved to another title, the visit is still live while the page shows the next one
// (its « Ma liste » button, and our rows in its panel until the poll). Nothing then acts for the old title.

import type { FicheScope } from "./fiche-page";
import { parseTitlePath } from "./fiche-path";

export function stillOnTitle(scope: FicheScope): boolean {
  const shown = parseTitlePath(scope.ports.pathname());
  const { title } = scope.page;
  return shown?.tmdbId === title.tmdbId && shown.mediaType === title.mediaType;
}
