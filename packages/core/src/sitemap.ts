import { XMLParser } from 'fast-xml-parser';
import { MAX_PATHS } from './config.js';
import { parseHttpUrl } from './url.js';

export interface SitemapOptions {
  /** Max number of paths returned. */
  limit?: number;
  /** Max number of sitemap documents fetched, including the starting document. */
  maxSitemaps?: number;
  /** Max bytes accepted from any one sitemap response. */
  maxResponseBytes?: number;
  /** Timeout for each sitemap request. */
  timeoutMs?: number;
  /** Injection point for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_MAX_SITEMAPS = 100;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

interface ParsedSitemap {
  /** Page URLs from a <urlset>. */
  urls: string[];
  /** Child sitemap URLs from a <sitemapindex>. */
  sitemaps: string[];
}

/** Parse a sitemap or sitemap-index XML document into its URL lists. */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const parser = new XMLParser({ ignoreAttributes: true });
  const doc: unknown = parser.parse(xml);

  return {
    urls: extractLocs(doc, 'urlset', 'url'),
    sitemaps: extractLocs(doc, 'sitemapindex', 'sitemap')
  };
}

function extractLocs(doc: unknown, root: string, entry: string): string[] {
  const rootNode = (doc as Record<string, unknown>)?.[root];
  if (!rootNode || typeof rootNode !== 'object') return [];
  const entries = (rootNode as Record<string, unknown>)[entry];
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return list
    .map((item) =>
      typeof item === 'object' && item !== null ? (item as { loc?: unknown }).loc : undefined
    )
    .filter((loc): loc is string => typeof loc === 'string' && loc.length > 0);
}

/**
 * Fetch a sitemap (following sitemap indexes up to 3 levels deep) and return
 * the sorted, deduplicated site paths. Accepts a sitemap URL or a bare origin,
 * in which case `/sitemap.xml` is assumed.
 */
export async function fetchSitemapPaths(
  sitemapUrl: string,
  options: SitemapOptions = {}
): Promise<string[]> {
  const limit = options.limit ?? 500;
  const maxSitemaps = options.maxSitemaps ?? DEFAULT_MAX_SITEMAPS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  for (const [name, value] of Object.entries({ limit, maxSitemaps, maxResponseBytes, timeoutMs })) {
    if (!Number.isInteger(value) || value <= 0)
      throw new Error(`${name} must be a positive integer`);
  }
  if (limit > MAX_PATHS) throw new Error(`limit must be at most ${MAX_PATHS}`);

  const start = parseHttpUrl(sitemapUrl, 'sitemap URL');
  if (start.pathname === '/' || start.pathname === '') {
    start.pathname = '/sitemap.xml';
  }

  const paths = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: start.href, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0 && paths.size < limit) {
    const next = queue.shift();
    if (!next || visited.has(next.url)) continue;
    if (visited.size >= maxSitemaps) {
      throw new Error(`sitemap import supports at most ${maxSitemaps} sitemap documents`);
    }
    visited.add(next.url);

    const response = await fetchImpl(next.url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new Error(`failed to fetch sitemap ${next.url}: HTTP ${response.status}`);
    }
    const { urls, sitemaps } = parseSitemapXml(
      await readResponseText(response, maxResponseBytes, next.url)
    );

    for (const url of urls) {
      if (paths.size >= limit) break;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
        paths.add(parsed.pathname + parsed.search);
      } catch {
        // skip malformed <loc> entries
      }
    }

    if (next.depth < 3) {
      for (const url of sitemaps) {
        const childUrl = parseHttpUrl(url, 'child sitemap URL', next.url).href;
        if (visited.has(childUrl) || queue.some((entry) => entry.url === childUrl)) continue;
        if (visited.size + queue.length >= maxSitemaps) {
          throw new Error(`sitemap import supports at most ${maxSitemaps} sitemap documents`);
        }
        queue.push({ url: childUrl, depth: next.depth + 1 });
      }
    }
  }

  return [...paths].sort();
}

async function readResponseText(
  response: Response,
  maxBytes: number,
  url: string
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`sitemap ${url} is larger than ${maxBytes} bytes`);
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`sitemap ${url} is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
