import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VizDiffStore } from './store/index.js';
import { pageResults } from './store/schema.js';

describe('VizDiffStore', () => {
  let dir: string;
  let store: VizDiffStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'vizdiff-store-'));
    store = new VizDiffStore(path.join(dir, 'test.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const createRun = () =>
    store.createRun({
      name: 'test run',
      baseA: 'https://old.example.com',
      baseB: 'https://new.example.com',
      configJson: '{}'
    });

  const sampleResult = (runId: number, overrides: Record<string, unknown> = {}) => ({
    runId,
    path: '/',
    viewport: 'desktop',
    viewportWidth: 1440,
    viewportHeight: 900,
    width: 1440,
    height: 2000,
    diffPercent: 1.5,
    status: 'ok' as const,
    error: null,
    screenshotA: 'runs/1/root__desktop/a.png',
    screenshotB: 'runs/1/root__desktop/b.png',
    diffImage: 'runs/1/root__desktop/diff.png',
    ...overrides
  });

  it('creates and fetches a run', () => {
    const run = createRun();
    expect(run.id).toBeGreaterThan(0);
    expect(run.status).toBe('running');

    const fetched = store.getRun(run.id);
    expect(fetched?.baseA).toBe('https://old.example.com');
    expect(fetched?.startedAt).toBeInstanceOf(Date);
  });

  it('rolls back a run when its ownership marker cannot be initialized', () => {
    expect(() =>
      store.createRun(
        {
          baseA: 'https://old.example.com',
          baseB: 'https://new.example.com',
          configJson: '{}'
        },
        () => {
          throw new Error('owner marker failed');
        }
      )
    ).toThrow('owner marker failed');

    expect(store.listRuns()).toEqual([]);
  });

  it('declares the run lookup index in Drizzle metadata', () => {
    expect(getTableConfig(pageResults).indexes).toHaveLength(1);
  });

  it('returns undefined for a missing run', () => {
    expect(store.getRun(999)).toBeUndefined();
  });

  it('stores and lists page results in path order', () => {
    const run = createRun();
    store.addPageResult(sampleResult(run.id, { path: '/b' }));
    store.addPageResult(sampleResult(run.id, { path: '/a' }));

    const results = store.getRunResults(run.id);
    expect(results.map((r) => r.path)).toEqual(['/a', '/b']);
  });

  it('finishes a run with a status and error', () => {
    const run = createRun();
    store.finishRun(run.id, 'failed', 'browser crashed');

    const fetched = store.getRun(run.id);
    expect(fetched?.status).toBe('failed');
    expect(fetched?.error).toBe('browser crashed');
    expect(fetched?.finishedAt).toBeInstanceOf(Date);
  });

  it('aggregates results in listRuns', () => {
    const run = createRun();
    store.addPageResult(sampleResult(run.id, { diffPercent: 0.5 }));
    store.addPageResult(
      sampleResult(run.id, { path: '/x', diffPercent: 7.2, status: 'over-threshold' })
    );
    store.addPageResult(
      sampleResult(run.id, { path: '/y', diffPercent: null, status: 'error', error: 'boom' })
    );

    const [listed] = store.listRuns();
    expect(listed?.total).toBe(3);
    expect(listed?.errors).toBe(1);
    expect(listed?.overThreshold).toBe(1);
    expect(listed?.maxDiffPercent).toBe(7.2);
  });

  it('lists newest runs first', () => {
    createRun();
    const second = createRun();
    const listed = store.listRuns();
    expect(listed[0]?.id).toBe(second.id);
  });
});
