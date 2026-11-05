// The title of a content, read with the tab's own Naka client (the token never leaves the tab) and kept
// for the tab's life. A miss, or a read that fails, is not kept: the next ask reads again.

import type { NakaItem } from "../naka/naka-items";

type Read = (contentId: number) => Promise<NakaItem | undefined>;

async function readOrNothing(
  read: Read,
  contentId: number,
): Promise<string | undefined> {
  try {
    return (await read(contentId))?.title;
  } catch {
    return undefined;
  }
}

export function createTitleLookup(
  read: Read,
): (contentId: number) => Promise<string | undefined> {
  const titles = new Map<number, string>();
  return async (contentId) => {
    const known = titles.get(contentId);
    if (known !== undefined) return known;
    const title = await readOrNothing(read, contentId);
    if (title !== undefined) titles.set(contentId, title);
    return title;
  };
}
