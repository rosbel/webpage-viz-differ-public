import { expect, test } from '@playwright/test';

const validRequest = {
  baseA: 'https://old.example.com',
  baseB: 'https://new.example.com',
  paths: ['/'],
  viewports: [{ name: 'desktop', width: 1440, height: 900 }]
};

test.describe('Local web API validation', () => {
  test('rejects cross-origin browser requests', async ({ request }) => {
    const response = await request.post('/api/runs', {
      headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
      data: JSON.stringify(validRequest)
    });
    expect(response.status()).toBe(403);
  });

  test('rejects non-loopback hostnames', async ({ request }) => {
    const response = await request.get('/', { headers: { Host: 'attacker.example' } });
    expect(response.status()).toBe(403);
  });

  test('requires JSON for API writes', async ({ request }) => {
    const response = await request.post('/api/runs', {
      headers: { 'Content-Type': 'text/plain' },
      data: JSON.stringify(validRequest)
    });
    expect(response.status()).toBe(415);
  });

  test('rejects paths that replace the configured origin', async ({ request }) => {
    const response = await request.post('/api/runs', {
      data: { ...validRequest, paths: ['//evil.example/path'] }
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('origin')
    });
  });

  test('rejects base URLs that are not origins', async ({ request }) => {
    const response = await request.post('/api/runs', {
      data: { ...validRequest, baseA: 'https://old.example.com/staging' }
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('origin')
    });
  });

  test('rejects filesystem-unsafe viewport names', async ({ request }) => {
    const response = await request.post('/api/runs', {
      data: {
        ...validRequest,
        viewports: [{ name: '../../../../tmp/outside', width: 1440, height: 900 }]
      }
    });
    expect(response.status()).toBe(400);
  });

  test('rejects an empty comparison matrix as a client error', async ({ request }) => {
    const response = await request.post('/api/runs', {
      data: { ...validRequest, paths: [] }
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('at least one')
    });
  });

  test('rejects oversized comparison matrices as a client error', async ({ request }) => {
    const response = await request.post('/api/runs', {
      data: {
        ...validRequest,
        paths: Array.from({ length: 101 }, (_, index) => `/p-${index}`),
        viewports: Array.from({ length: 20 }, (_, index) => ({
          name: `v-${index}`,
          width: 100,
          height: 100
        }))
      }
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('2000')
    });
  });

  test('sitemap imports are POST-only', async ({ request }) => {
    const response = await request.get('/api/sitemap?url=https://example.com');
    expect(response.status()).toBe(405);
  });
});
