import { readAverage } from "./average-rating";
import { nextDataText } from "./next-data";

// Parses the Apollo cache that SensCritique embeds in a season page (<script id="__NEXT_DATA__">).
// Pure: no network. Any unreadable page gives an empty result, never a throw.
// Only the requested series and season are read: the episodes are the refs listed by that season's own entry.

export type ScEpisode = {
  productId: number;
  season: number;
  episode: number;
  title: string;
  /** The episode's public average (0 to 10, one decimal), null when absent or unreadable. */
  average: number | null;
};

type ApolloState = Record<string, unknown>;
type ProductEntry = {
  id: number;
  url: string;
  title: string;
  fields: Record<string, unknown>;
};

const DIGITS = /^\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNextData(html: string): unknown {
  const text = nextDataText(html);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function apolloState(html: string): ApolloState {
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
  return {
    id,
    url,
    title: typeof title === "string" ? title : "",
    fields: value,
  };
}

function seasonSuffix(seriesProductId: number, season: number): string {
  return `/${seriesProductId}/S${season}`;
}

function findSeason(
  state: ApolloState,
  seriesProductId: number,
  season: number,
): ProductEntry | undefined {
  const suffix = seasonSuffix(seriesProductId, season);
  for (const [key, value] of Object.entries(state)) {
    const entry = toProduct(key, value);
    if (entry?.url.endsWith(suffix)) return entry;
  }
  return undefined;
}

function refKeys(fields: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (!name.startsWith("episodes(") || !Array.isArray(value)) continue;
    for (const item of value) {
      if (isRecord(item) && typeof item.__ref === "string") {
        keys.push(item.__ref);
      }
    }
  }
  return keys;
}

function toEpisode(
  entry: ProductEntry,
  seriesProductId: number,
  season: number,
): ScEpisode | undefined {
  const cut = entry.url.lastIndexOf("/E");
  if (cut < 0) return undefined;
  const number = entry.url.slice(cut + 2);
  const head = entry.url.slice(0, cut);
  if (!DIGITS.test(number)) return undefined;
  if (!head.endsWith(seasonSuffix(seriesProductId, season))) return undefined;
  return {
    productId: entry.id,
    season,
    episode: Number(number),
    title: entry.title,
    average: readAverage(entry.fields),
  };
}

export function parseSeasonEpisodes(
  html: string,
  seriesProductId: number,
  season: number,
): ScEpisode[] {
  const state = apolloState(html);
  const seasonEntry = findSeason(state, seriesProductId, season);
  if (seasonEntry === undefined) return [];
  const byId = new Map<number, ScEpisode>();
  for (const key of refKeys(seasonEntry.fields)) {
    const entry = toProduct(key, state[key]);
    if (entry === undefined) continue;
    const episode = toEpisode(entry, seriesProductId, season);
    if (episode !== undefined && !byId.has(episode.productId)) {
      byId.set(episode.productId, episode);
    }
  }
  return [...byId.values()].sort((a, b) => a.episode - b.episode);
}

export function parseSeasonProductId(
  html: string,
  seriesProductId: number,
  season: number,
): number | undefined {
  return findSeason(apolloState(html), seriesProductId, season)?.id;
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
