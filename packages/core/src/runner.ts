import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import {
  effectiveThreshold,
  maskSelectorsFor,
  type ResolvedConfig,
  type Viewport
} from './config.js';
import { capturePage } from './capture.js';
import { diffPngFiles } from './diff.js';
import { clearRunOwner, reconcileInterruptedRuns, recordRunOwner } from './recovery.js';
import { VizDiffStore } from './store/index.js';
import type { PageResult, PageStatus, ProgressEvent, RunReport, RunSummary } from './types.js';

export interface RunOptions {
  onProgress?: (event: ProgressEvent) => void;
  /** Reuse an existing store (the runner opens `<outputDir>/vizdiff.db` otherwise). */
  store?: VizDiffStore;
  /** Reuse an existing browser (the runner launches and closes its own otherwise). */
  browser?: Browser;
}

/** Decide a page's status from its diff percent and the threshold that applies to it. */
export function evaluateStatus(
  diffPercent: number,
  threshold: number | 'expected-different' | null
): PageStatus {
  if (threshold === 'expected-different') return 'expected-different';
  if (threshold !== null && diffPercent > threshold) return 'over-threshold';
  return 'ok';
}

/** Stable directory name for a path: '/' → 'root', '/blog/post-1' → 'blog-post-1'. */
export function slugifyPath(sitePathname: string): string {
  const slug = sitePathname
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'root';
}

/** Collision-resistant, filesystem-safe directory name for a path × viewport job. */
export function artifactDirectoryName(sitePathname: string, viewportName: string): string {
  const readable = slugifyPath(sitePathname).slice(0, 80);
  const fingerprint = createHash('sha256').update(sitePathname).digest('hex');
  return `${readable}-${fingerprint}__${viewportName}`;
}

/** Resolve a path below the output directory and reject traversal outside it. */
export function resolveOutputPath(outputDir: string, ...segments: string[]): string {
  const root = path.resolve(outputDir);
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`output path resolves outside the configured output directory: ${resolved}`);
  }
  return resolved;
}

/** Apply a configured path to a base URL without allowing it to replace the origin. */
export function resolveSiteUrl(baseUrl: string, sitePathname: string): string {
  const base = new URL(baseUrl);
  const resolved = new URL(sitePathname, base);
  if (resolved.origin !== base.origin) {
    throw new Error(`path must stay on the configured origin: ${sitePathname}`);
  }
  return resolved.href;
}

/** A configured threshold gates only threshold exceedances; capture errors are reported separately. */
export function evaluateRunGate(hasGate: boolean, overThreshold: number): boolean | null {
  return hasGate ? overThreshold === 0 : null;
}

/**
 * Compare every configured path across both origins at every viewport,
 * persisting screenshots, diff images, and results as it goes.
 */
export async function runComparison(
  config: ResolvedConfig,
  options: RunOptions = {}
): Promise<RunReport> {
  const startedAt = Date.now();
  const outputDir = path.resolve(config.outputDir);
  const store = options.store ?? new VizDiffStore(path.join(outputDir, 'vizdiff.db'));
  const ownStore = !options.store;
  const emit = options.onProgress ?? (() => {});

  const jobs: Array<{ path: string; viewport: Viewport }> = config.paths.flatMap((p) =>
    config.viewports.map((viewport) => ({ path: p, viewport }))
  );
  const ownBrowser = !options.browser;
  const results: PageResult[] = [];
  let browser = options.browser;
  let runId: number | undefined;

  try {
    reconcileInterruptedRuns(store, outputDir);
    const run = store.createRun(
      {
        name: config.name,
        baseA: config.baseA,
        baseB: config.baseB,
        configJson: JSON.stringify(config)
      },
      (createdRun) => recordRunOwner(outputDir, createdRun.id)
    );
    runId = run.id;
    emit({ type: 'run-started', runId: run.id, total: jobs.length });

    browser ??= await chromium.launch();
    const activeBrowser = browser;
    let nextJob = 0;
    let completedCount = 0;

    const worker = async () => {
      while (nextJob < jobs.length) {
        const index = nextJob++;
        const job = jobs[index];
        if (!job) return;

        emit({
          type: 'page-started',
          runId: run.id,
          path: job.path,
          viewport: job.viewport.name,
          index,
          total: jobs.length
        });

        const result = await comparePage(activeBrowser, config, run.id, outputDir, job);
        results.push(result);
        store.addPageResult({
          runId: run.id,
          path: result.path,
          viewport: result.viewport.name,
          viewportWidth: result.viewport.width,
          viewportHeight: result.viewport.height,
          width: result.width,
          height: result.height,
          diffPercent: result.diffPercent,
          status: result.status,
          error: result.error,
          screenshotA: result.screenshotA,
          screenshotB: result.screenshotB,
          diffImage: result.diffImage
        });
        completedCount++;
        emit({
          type: 'page-completed',
          runId: run.id,
          result,
          index: completedCount,
          total: jobs.length
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(config.capture.concurrency, jobs.length) }, worker)
    );

    const summary = summarize(run.id, config, results, Date.now() - startedAt);
    store.finishRun(run.id, 'completed');
    emit({ type: 'run-finished', runId: run.id, summary });
    return { runId: run.id, summary, results };
  } catch (error) {
    if (runId !== undefined) {
      store.finishRun(runId, 'failed', error instanceof Error ? error.message : String(error));
    }
    throw error;
  } finally {
    try {
      if (ownBrowser && browser) await browser.close();
    } finally {
      if (runId !== undefined) clearRunOwner(outputDir, runId);
      if (ownStore) store.close();
    }
  }
}

async function comparePage(
  browser: Browser,
  config: ResolvedConfig,
  runId: number,
  outputDir: string,
  job: { path: string; viewport: Viewport }
): Promise<PageResult> {
  const relDir = path.join(
    'runs',
    String(runId),
    artifactDirectoryName(job.path, job.viewport.name)
  );
  const absDir = resolveOutputPath(outputDir, relDir);
  mkdirSync(absDir, { recursive: true });

  const maskSelectors = maskSelectorsFor(config, job.path);
  const base: Omit<PageResult, 'diffPercent' | 'status' | 'error' | 'width' | 'height'> = {
    path: job.path,
    viewport: job.viewport,
    screenshotA: path.join(relDir, 'a.png'),
    screenshotB: path.join(relDir, 'b.png'),
    diffImage: path.join(relDir, 'diff.png')
  };

  try {
    const commonCaptureOptions = {
      viewport: job.viewport,
      maskSelectors,
      fullPage: config.capture.fullPage,
      timeoutMs: config.capture.timeoutMs,
      scrollPrime: config.capture.scrollPrime
    };
    const sides = [
      { baseUrl: config.baseA, fileName: 'a.png' },
      { baseUrl: config.baseB, fileName: 'b.png' }
    ] as const;

    const captures = await Promise.allSettled(
      sides.map(({ baseUrl, fileName }) =>
        capturePage(browser, {
          ...commonCaptureOptions,
          url: resolveSiteUrl(baseUrl, job.path),
          outPath: path.join(absDir, fileName)
        })
      )
    );
    const failedCapture = captures.find(
      (capture): capture is PromiseRejectedResult => capture.status === 'rejected'
    );
    if (failedCapture) throw failedCapture.reason;

    const diff = await diffPngFiles(
      path.join(absDir, 'a.png'),
      path.join(absDir, 'b.png'),
      path.join(absDir, 'diff.png'),
      { pixelThreshold: config.capture.pixelThreshold }
    );

    return {
      ...base,
      diffPercent: diff.diffPercent,
      status: evaluateStatus(diff.diffPercent, effectiveThreshold(config, job.path)),
      error: null,
      width: diff.width,
      height: diff.height
    };
  } catch (error) {
    return {
      ...base,
      screenshotA: null,
      screenshotB: null,
      diffImage: null,
      diffPercent: null,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      width: job.viewport.width,
      height: job.viewport.height
    };
  }
}

function summarize(
  runId: number,
  config: ResolvedConfig,
  results: PageResult[],
  durationMs: number
): RunSummary {
  const count = (status: PageStatus) => results.filter((r) => r.status === status).length;
  const errors = count('error');
  const overThreshold = count('over-threshold');
  const hasGate =
    config.threshold.maxDiffPercent !== undefined ||
    Object.values(config.threshold.perPath).some((t) => typeof t === 'number');

  return {
    runId,
    total: results.length,
    completed: results.length - errors,
    ok: count('ok'),
    overThreshold,
    expectedDifferent: count('expected-different'),
    errors,
    maxDiffPercent: Math.max(0, ...results.map((r) => r.diffPercent ?? 0)),
    passed: evaluateRunGate(hasGate, overThreshold),
    durationMs
  };
}
