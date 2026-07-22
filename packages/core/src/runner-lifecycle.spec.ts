import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from './config.js';
import { runComparison } from './runner.js';
import { VizDiffStore } from './store/index.js';

const launchBrowser = vi.hoisted(() => vi.fn());

vi.mock('playwright', async (importOriginal) => {
  const actual = await importOriginal<typeof import('playwright')>();
  return { ...actual, chromium: { ...actual.chromium, launch: launchBrowser } };
});

const tempDirs: string[] = [];

afterEach(() => {
  launchBrowser.mockReset();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('runComparison lifecycle', () => {
  it('persists a failed run when Chromium cannot launch', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'vizdiff-runner-'));
    tempDirs.push(outputDir);
    const config = resolveConfig({
      baseA: 'https://old.example.com',
      baseB: 'https://new.example.com',
      paths: ['/'],
      viewports: [{ name: 'desktop', width: 100, height: 100 }],
      outputDir
    });
    launchBrowser.mockRejectedValueOnce(new Error('browser unavailable'));

    await expect(runComparison(config)).rejects.toThrow('browser unavailable');

    const store = new VizDiffStore(path.join(outputDir, 'vizdiff.db'));
    try {
      const [run] = store.listRuns();
      expect(run?.status).toBe('failed');
      expect(run?.error).toBe('browser unavailable');
      expect(run?.finishedAt).toBeInstanceOf(Date);
    } finally {
      store.close();
    }
  });
});
