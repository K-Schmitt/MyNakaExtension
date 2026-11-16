// The status page's timer and its poll interval, shared by the status, lists and handled controllers.

// While the worker still works on something the page waits for (a job, a mode change, an answer, a
// cancel), the page asks again this often.
export const POLL_MS = 5000;

export type PageTimer = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};
