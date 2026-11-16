// The one `fetch` shape both site clients take: the worker and the Naka tab inject their own, so a client
// never reaches the global.

export type Fetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    credentials: "include" | "omit";
    redirect?: "error" | "follow" | "manual";
    /** Set by the worker's request timeout, never by the clients. */
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
