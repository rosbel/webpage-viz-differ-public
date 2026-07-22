import { describe, expect, it } from 'vitest';
import { effectiveThreshold, maskSelectorsFor, resolveConfig } from './config.js';
import { evaluateStatus } from './runner.js';

const minimal = {
  baseA: 'https://old.example.com',
  baseB: 'https://new.example.com',
  paths: ['/']
};

describe('resolveConfig', () => {
  it('applies defaults to a minimal config', () => {
    const config = resolveConfig(minimal);
    expect(config.viewports).toEqual([
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 }
    ]);
    expect(config.capture.fullPage).toBe(true);
    expect(config.capture.concurrency).toBe(3);
    expect(config.capture.pixelThreshold).toBe(0.1);
    expect(config.threshold.maxDiffPercent).toBeUndefined();
    expect(config.outputDir).toBe('.vizdiff');
  });

  it('rejects non-http(s) base URLs', () => {
    expect(() => resolveConfig({ ...minimal, baseA: 'file:///etc/passwd' })).toThrow();
    expect(() => resolveConfig({ ...minimal, baseB: 'not a url' })).toThrow();
  });

  it('rejects credentials embedded in base URLs', () => {
    expect(() =>
      resolveConfig({ ...minimal, baseA: 'https://user:secret@old.example.com' })
    ).toThrow(/credentials/);
  });

  it.each([
    'https://old.example.com/staging',
    'https://old.example.com/?preview=true',
    'https://old.example.com/#preview'
  ])('rejects a base URL that is not an origin: %s', (baseA) => {
    expect(() => resolveConfig({ ...minimal, baseA })).toThrow(/origin/);
  });

  it('rejects paths without a leading slash', () => {
    expect(() => resolveConfig({ ...minimal, paths: ['pricing'] })).toThrow();
  });

  it('rejects paths that can override the configured origin', () => {
    expect(() => resolveConfig({ ...minimal, paths: ['//evil.example/path'] })).toThrow(/origin/);
    expect(() => resolveConfig({ ...minimal, paths: ['/\\evil.example/path'] })).toThrow(/origin/);
  });

  it('requires at least one path when no pathsFile is set', () => {
    expect(() => resolveConfig({ ...minimal, paths: [] })).toThrow(/at least one/);
  });

  it('deduplicates paths', () => {
    const config = resolveConfig({ ...minimal, paths: ['/', '/a', '/'] });
    expect(config.paths).toEqual(['/', '/a']);
  });

  it('rejects unsafe or duplicate viewport names', () => {
    expect(() =>
      resolveConfig({
        ...minimal,
        viewports: [{ name: '../../outside', width: 100, height: 100 }]
      })
    ).toThrow(/viewport name/);
    expect(() =>
      resolveConfig({
        ...minimal,
        viewports: [
          { name: 'desktop', width: 100, height: 100 },
          { name: 'desktop', width: 200, height: 200 }
        ]
      })
    ).toThrow(/unique/);
  });

  it('bounds viewport dimensions and run matrix size', () => {
    expect(() =>
      resolveConfig({ ...minimal, viewports: [{ name: 'huge', width: 100_000, height: 100 }] })
    ).toThrow();
    expect(() =>
      resolveConfig({
        ...minimal,
        paths: Array.from({ length: 1_001 }, (_, index) => `/page-${index}`)
      })
    ).toThrow();
    expect(() =>
      resolveConfig({
        ...minimal,
        paths: Array.from({ length: 101 }, (_, index) => `/page-${index}`),
        viewports: Array.from({ length: 20 }, (_, index) => ({
          name: `viewport-${index}`,
          width: 100,
          height: 100
        }))
      })
    ).toThrow(/run matrix/);
  });

  it('accepts expected-different as a per-path threshold', () => {
    const config = resolveConfig({
      ...minimal,
      threshold: { maxDiffPercent: 1, perPath: { '/redesigned': 'expected-different' } }
    });
    expect(config.threshold.perPath['/redesigned']).toBe('expected-different');
  });
});

describe('effectiveThreshold', () => {
  const config = resolveConfig({
    ...minimal,
    threshold: { maxDiffPercent: 0.5, perPath: { '/loose': 10, '/skip': 'expected-different' } }
  });

  it('prefers the per-path override', () => {
    expect(effectiveThreshold(config, '/loose')).toBe(10);
    expect(effectiveThreshold(config, '/skip')).toBe('expected-different');
  });

  it('falls back to the global threshold', () => {
    expect(effectiveThreshold(config, '/other')).toBe(0.5);
  });

  it('is null when nothing is configured (report-only)', () => {
    expect(effectiveThreshold(resolveConfig(minimal), '/anything')).toBeNull();
  });
});

describe('evaluateStatus', () => {
  it('is always ok in report-only mode', () => {
    expect(evaluateStatus(99.9, null)).toBe('ok');
  });

  it('honors expected-different', () => {
    expect(evaluateStatus(50, 'expected-different')).toBe('expected-different');
  });

  it('compares against a numeric threshold', () => {
    expect(evaluateStatus(0.4, 0.5)).toBe('ok');
    expect(evaluateStatus(0.5, 0.5)).toBe('ok');
    expect(evaluateStatus(0.51, 0.5)).toBe('over-threshold');
  });
});

describe('maskSelectorsFor', () => {
  it('combines global and per-path selectors', () => {
    const config = resolveConfig({
      ...minimal,
      mask: { global: ['.ad'], perPath: { '/': ['.hero-video'] } }
    });
    expect(maskSelectorsFor(config, '/')).toEqual(['.ad', '.hero-video']);
    expect(maskSelectorsFor(config, '/other')).toEqual(['.ad']);
  });
});
