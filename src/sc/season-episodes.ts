// Parses the Apollo cache that SensCritique embeds in a season page (<script id="__NEXT_DATA__">).
// Pure: no network. Any unreadable page gives an empty result, never a throw.

export type ScEpisode = {
  productId: number;
  season: number;
  episode: number;
  title: string;
};

type ProductEntry = { id: number; url: string; title: string };

const NEXT_DATA =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const EPISODE_URL = /\/S(\d+)\/E(\d+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNextData(html: string): unknown {
  const match = NEXT_DATA.exec(html);
  if (match?.[1] === undefined) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

function apolloState(html: string): Record<string, unknown> {
  const root = readNextData(html);
  if (!isRecord(root)) return {};
  const props = root.props;
  if (!isRecord(props)) return {};
  const pageProps = props.pageProps;
  if (!isRecord(pageProps)) return {};
  const state = pageProps.__APOLLO_STATE__;
  return isRecord(state) ? state : {};
}

function toProduct(key: string, value: unknown): ProductEntry | undefined {
  if (!key.startsWith("Product:") || !isRecord(value)) return undefined;
  const { id, url, title } = value;
  if (typeof id !== "number" || typeof url !== "string") return undefined;
  return { id, url, title: typeof title === "string" ? title : "" };
}

function products(html: string): ProductEntry[] {
  const found: ProductEntry[] = [];
  for (const [key, value] of Object.entries(apolloState(html))) {
    const entry = toProduct(key, value);
    if (entry !== undefined) found.push(entry);
  }
  return found;
}

function toEpisode(entry: ProductEntry): ScEpisode | undefined {
  const match = EPISODE_URL.exec(entry.url);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return {
    productId: entry.id,
    season: Number(match[1]),
    episode: Number(match[2]),
    title: entry.title,
  };
}

export function parseSeasonEpisodes(html: string): ScEpisode[] {
  const byId = new Map<number, ScEpisode>();
  for (const entry of products(html)) {
    const episode = toEpisode(entry);
    if (episode !== undefined && !byId.has(episode.productId)) {
      byId.set(episode.productId, episode);
    }
  }
  return [...byId.values()].sort(
    (a, b) => a.season - b.season || a.episode - b.episode,
  );
}

export function parseSeasonProductId(
  html: string,
  season: number,
): number | undefined {
  const suffix = new RegExp(`/S${season}$`);
  return products(html).find((entry) => suffix.test(entry.url))?.id;
}

export function findEpisode(
  episodes: ScEpisode[],
  season: number,
  episode: number,
): ScEpisode | undefined {
  return episodes.find((e) => e.season === season && e.episode === episode);
}

export function seasonUrl(seriesProductId: number, season: number): string {
  return `https://www.senscritique.com/serie/x/${seriesProductId}/S${season}`;
}
