import { errors, type Browser, type Page } from 'playwright';
import type { Viewport } from './config.js';

export interface CaptureOptions {
  url: string;
  viewport: Viewport;
  outPath: string;
  maskSelectors: string[];
  fullPage: boolean;
  timeoutMs: number;
  scrollPrime: boolean;
}

/**
 * CSS injected before capture to remove the main sources of pixel noise:
 * animations, transitions, blinking carets, and smooth scrolling.
 */
const FREEZE_CSS = `
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}
html {
  scroll-behavior: auto !important;
}
`;

/** Both sides get the same mask color, so masked regions never diff. */
const MASK_COLOR = '#FF00FF';

/**
 * Capture a deterministic full-page screenshot: reduced motion, frozen
 * animations, fonts loaded, lazy content primed, configured selectors masked.
 * A network-idle timeout is not fatal — the page is captured as-is.
 */
export async function capturePage(browser: Browser, options: CaptureOptions): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: options.viewport.width, height: options.viewport.height },
    reducedMotion: 'reduce',
    deviceScaleFactor: 1
  });

  try {
    const page = await context.newPage();

    try {
      await page.goto(options.url, { waitUntil: 'networkidle', timeout: options.timeoutMs });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      // Sites with long-polling or analytics never reach network idle;
      // capture whatever has rendered by the timeout.
    }

    await page.addStyleTag({ content: FREEZE_CSS });
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    if (options.scrollPrime) {
      await primeLazyContent(page);
    }

    await page.screenshot({
      path: options.outPath,
      fullPage: options.fullPage,
      animations: 'disabled',
      mask: options.maskSelectors.map((selector) => page.locator(selector)),
      maskColor: MASK_COLOR,
      timeout: options.timeoutMs
    });
  } finally {
    await context.close();
  }
}

/**
 * Scroll through the whole page and back to the top so lazy-loaded images and
 * below-the-fold sections are rendered in the full-page shot.
 */
export async function primeLazyContent(page: Page): Promise<void> {
  const maxScrollSteps = 100;
  let nextY = 0;

  for (let step = 0; step < maxScrollSteps; step++) {
    const metrics = await readPageMetrics(page);
    if (!metrics) break;

    const targetY = Math.min(nextY, metrics.pageHeight);
    await page.evaluate((y) => window.scrollTo(0, y), targetY).catch(() => {});
    await page.waitForTimeout(100);

    const afterScroll = await readPageMetrics(page);
    if (!afterScroll || targetY >= afterScroll.pageHeight) break;
    nextY = targetY + metrics.viewportHeight;
  }

  await page.evaluate((y) => window.scrollTo(0, y), 0).catch(() => {});
  await page.waitForTimeout(250);
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}

function readPageMetrics(
  page: Page
): Promise<{ viewportHeight: number; pageHeight: number } | null> {
  return page
    .evaluate(() => ({
      viewportHeight: Math.max(window.innerHeight, 1),
      pageHeight: Math.max(
        document.documentElement?.scrollHeight ?? 0,
        document.body?.scrollHeight ?? 0
      )
    }))
    .catch(() => null);
}
