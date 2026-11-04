export const AUTO_RUN_GAP_MS = 15 * 60 * 1000;
export const PLAYLIST_DEBOUNCE_MS = 5000;

export function shouldStartAutoRun(
  lastAutoRunAt: number | undefined,
  now: number,
): boolean {
  if (lastAutoRunAt === undefined) return true;
  // A clock that went backwards must not block automatic runs forever.
  if (now < lastAutoRunAt) return true;
  return now - lastAutoRunAt >= AUTO_RUN_GAP_MS;
}
