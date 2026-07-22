import type { PageResult, PageResultRow, PageStatus } from '@webpage-viz-differ/core';

export interface ResultView {
  key: string;
  path: string;
  viewport: string;
  diffPercent: number | null;
  status: PageStatus;
  error: string | null;
  a: string | null;
  b: string | null;
  diff: string | null;
}

/** Normalize persisted rows and live runner results into one UI representation. */
export function toResultView(source: PageResult | PageResultRow): ResultView {
  const viewport = typeof source.viewport === 'string' ? source.viewport : source.viewport.name;
  return {
    key: JSON.stringify([source.path, viewport]),
    path: source.path,
    viewport,
    diffPercent: source.diffPercent,
    status: source.status,
    error: source.error,
    a: source.screenshotA,
    b: source.screenshotB,
    diff: source.diffImage
  };
}
