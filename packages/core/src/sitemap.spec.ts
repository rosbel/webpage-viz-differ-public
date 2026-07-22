import { describe, expect, it } from 'vitest';
import { fetchSitemapPaths, parseSitemapXml } from './sitemap.js';

const urlset = (urls: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `<url><loc>${url}</loc></url>`).join('\n')}
</urlset>`;

const sitemapIndex = (urls: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join('\n')}
</sitemapindex>`;

function fakeFetch(pages: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const body = pages[url];
    return new Response(body ?? '', { status: body !== undefined ? 200 : 404 });
  }) as typeof fetch;
}

describe('parseSitemapXml', () => {
  it('parses a urlset', () => {
    const { urls, sitemaps } = parseSitemapXml(urlset(['https://a.com/', 'https://a.com/pricing']));
    expect(urls).toEqual(['https://a.com/', 'https://a.com/pricing']);
    expect(sitemaps).toEqual([]);
  });

  it('parses a sitemap index', () => {
    const { urls, sitemaps } = parseSitemapXml(sitemapIndex(['https://a.com/pages.xml']));
    expect(urls).toEqual([]);
    expect(sitemaps).toEqual(['https://a.com/pages.xml']);
  });

  it('normalizes a single entry that the XML parser does not wrap in an array', () => {
    const { urls } = parseSitemapXml(urlset(['https://a.com/only']));
    expect(urls).toEqual(['https://a.com/only']);
  });

  it('returns empty lists for non-sitemap XML', () => {
    expect(parseSitemapXml('<html><body>nope</body></html>')).toEqual({ urls: [], sitemaps: [] });
  });
});

describe('fetchSitemapPaths', () => {
  it('assumes /sitemap.xml when given a bare origin', async () => {
    const paths = await fetchSitemapPaths('https://a.com', {
      fetchImpl: fakeFetch({
        'https://a.com/sitemap.xml': urlset(['https://a.com/', 'https://a.com/about'])
      })
    });
    expect(paths).toEqual(['/', '/about']);
  });

  it('follows sitemap indexes and dedupes paths', async () => {
    const paths = await fetchSitemapPaths('https://a.com/sitemap.xml', {
      fetchImpl: fakeFetch({
        'https://a.com/sitemap.xml': sitemapIndex([
          'https://a.com/pages.xml',
          'https://a.com/blog.xml'
        ]),
        'https://a.com/pages.xml': urlset(['https://a.com/', 'https://a.com/pricing']),
        'https://a.com/blog.xml': urlset(['https://a.com/pricing', 'https://a.com/blog/x'])
      })
    });
    expect(paths).toEqual(['/', '/blog/x', '/pricing']);
  });

  it('respects the limit', async () => {
    const paths = await fetchSitemapPaths('https://a.com/sitemap.xml', {
      limit: 2,
      fetchImpl: fakeFetch({
        'https://a.com/sitemap.xml': urlset([
          'https://a.com/1',
          'https://a.com/2',
          'https://a.com/3'
        ])
      })
    });
    expect(paths).toHaveLength(2);
  });

  it('rejects path limits larger than the config can consume', async () => {
    await expect(fetchSitemapPaths('https://a.com', { limit: 1_001 })).rejects.toThrow(/at most/);
  });

  it('rejects non-http(s) URLs', async () => {
    await expect(fetchSitemapPaths('file:///sitemap.xml')).rejects.toThrow(/http/);
  });

  it('throws on a failed fetch', async () => {
    await expect(
      fetchSitemapPaths('https://a.com/missing.xml', { fetchImpl: fakeFetch({}) })
    ).rejects.toThrow(/404/);
  });

  it('rejects non-http(s) child sitemap URLs', async () => {
    await expect(
      fetchSitemapPaths('https://a.com/sitemap.xml', {
        fetchImpl: fakeFetch({
          'https://a.com/sitemap.xml': sitemapIndex(['file:///etc/passwd'])
        })
      })
    ).rejects.toThrow(/child sitemap URL/);
  });

  it('bounds the number of fetched sitemap documents', async () => {
    await expect(
      fetchSitemapPaths('https://a.com/sitemap.xml', {
        maxSitemaps: 2,
        fetchImpl: fakeFetch({
          'https://a.com/sitemap.xml': sitemapIndex([
            'https://a.com/one.xml',
            'https://a.com/two.xml'
          ]),
          'https://a.com/one.xml': sitemapIndex(['https://a.com/three.xml']),
          'https://a.com/two.xml': urlset([]),
          'https://a.com/three.xml': urlset([])
        })
      })
    ).rejects.toThrow(/at most 2 sitemap/);
  });

  it('rejects oversized sitemap responses', async () => {
    await expect(
      fetchSitemapPaths('https://a.com/sitemap.xml', {
        maxResponseBytes: 32,
        fetchImpl: fakeFetch({
          'https://a.com/sitemap.xml': urlset(['https://a.com/a-very-long-page-name'])
        })
      })
    ).rejects.toThrow(/larger than 32 bytes/);
  });
});
