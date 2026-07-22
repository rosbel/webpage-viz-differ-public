import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { capturePageMock } = vi.hoisted(() => ({ capturePageMock: vi.fn() }));
vi.mock('./capture.js', () => ({ capturePage: capturePageMock }));

import { resolveConfig } from './config.js';
import { runComparison } from './runner.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  capturePageMock.mockReset();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('paired capture concurrency', () => {
  it('waits for both sides before a worker starts the next job', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'vizdiff-concurrency-'));
    temporaryDirectories.push(outputDir);

    let releaseSlowCapture = () => {};
    const slowCapture = new Promise<{ width: number; height: number }>((resolve) => {
      releaseSlowCapture = () => resolve({ width: 100, height: 100 });
    });
    capturePageMock.mockImplementation((_browser: Browser, { url }: { url: string }) =>
      new URL(url).origin === 'https://a.test'
        ? Promise.reject(new Error('site A failed'))
        : slowCapture
    );

    const comparison = runComparison(
      resolveConfig({
        baseA: 'https://a.test',
        baseB: 'https://b.test',
        paths: ['/one', '/two'],
        viewports: [{ name: 'test', width: 100, height: 100 }],
        capture: { concurrency: 1 },
        outputDir
      }),
      { browser: {} as Browser }
    );

    await vi.waitFor(() => expect(capturePageMock).toHaveBeenCalledTimes(2));
    expect(capturePageMock.mock.calls.map(([, options]) => options.url)).toEqual([
      'https://a.test/one',
      'https://b.test/one'
    ]);

    releaseSlowCapture();
    const report = await comparison;

    expect(capturePageMock).toHaveBeenCalledTimes(4);
    expect(report.results).toHaveLength(2);
    expect(report.results.every((result) => result.status === 'error')).toBe(true);
  });
});
