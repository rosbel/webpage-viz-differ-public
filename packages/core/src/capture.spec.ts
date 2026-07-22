import type { Page } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import { primeLazyContent } from './capture.js';

describe('primeLazyContent', () => {
  it('stops scrolling when the document keeps growing', async () => {
    let pageHeight = 1000;
    const evaluate = vi.fn(async (_callback: unknown, scrollTarget?: number) => {
      if (scrollTarget !== undefined) return;
      pageHeight += 100;
      return { viewportHeight: 100, pageHeight };
    });
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const page = { evaluate, waitForTimeout, waitForLoadState } as unknown as Page;

    await primeLazyContent(page);

    // The implementation has a hard 100-step ceiling, plus one final scroll-to-top.
    expect(waitForTimeout).toHaveBeenCalledTimes(101);
    expect(evaluate.mock.calls.filter((call) => call[1] !== undefined)).toHaveLength(101);
  });
});
