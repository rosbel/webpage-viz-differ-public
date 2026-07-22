import { describe, expect, it } from 'vitest';
import {
  artifactDirectoryName,
  evaluateRunGate,
  resolveOutputPath,
  resolveSiteUrl,
  slugifyPath
} from './runner.js';

describe('slugifyPath', () => {
  it('maps the root path to "root"', () => {
    expect(slugifyPath('/')).toBe('root');
  });

  it('flattens nested paths', () => {
    expect(slugifyPath('/blog/post-1')).toBe('blog-post-1');
  });

  it('strips query strings and unsafe characters', () => {
    expect(slugifyPath('/search?q=a&page=2')).toBe('search-q-a-page-2');
  });
});

describe('artifactDirectoryName', () => {
  it('does not collide for paths with the same readable slug', () => {
    expect(artifactDirectoryName('/a/b', 'desktop')).not.toBe(
      artifactDirectoryName('/a-b', 'desktop')
    );
  });

  it('keeps the readable path and viewport in the directory name', () => {
    expect(artifactDirectoryName('/blog/post-1', 'mobile')).toMatch(
      /^blog-post-1-[a-f0-9]{64}__mobile$/
    );
  });
});

describe('resolveOutputPath', () => {
  it('resolves paths contained by the output directory', () => {
    expect(resolveOutputPath('/tmp/vizdiff', 'runs/1/a.png')).toBe('/tmp/vizdiff/runs/1/a.png');
  });

  it('rejects paths that escape the output directory', () => {
    expect(() => resolveOutputPath('/tmp/vizdiff', '../../outside/a.png')).toThrow(/outside/);
  });
});

describe('resolveSiteUrl', () => {
  it('applies a site path without changing the configured origin', () => {
    expect(resolveSiteUrl('https://old.example.com', '/pricing')).toBe(
      'https://old.example.com/pricing'
    );
  });

  it('rejects network-path references', () => {
    expect(() => resolveSiteUrl('https://old.example.com', '//evil.example/path')).toThrow(
      /origin/
    );
  });
});

describe('evaluateRunGate', () => {
  it('is report-only without a configured threshold', () => {
    expect(evaluateRunGate(false, 10)).toBeNull();
  });

  it('depends only on threshold exceedances', () => {
    expect(evaluateRunGate(true, 0)).toBe(true);
    expect(evaluateRunGate(true, 1)).toBe(false);
  });
});
