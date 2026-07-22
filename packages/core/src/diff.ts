import { promises as fs } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface DiffOptions {
  /** pixelmatch per-pixel sensitivity (0 strictest – 1 loosest). */
  pixelThreshold?: number;
}

export interface DiffResult {
  /** Exact percent of pixels that differ (0–100). Round only when presenting it. */
  diffPercent: number;
  mismatchedPixels: number;
  /** Compared dimensions (the larger of the two inputs on each axis). */
  width: number;
  height: number;
}

/**
 * Diff two PNG buffers. Inputs with different dimensions are padded to the
 * union size on a white background so layout growth shows up as a diff instead
 * of crashing pixelmatch.
 */
export function diffPngBuffers(
  bufferA: Buffer,
  bufferB: Buffer,
  options: DiffOptions = {}
): { result: DiffResult; diffPng: Buffer } {
  let a: PNG = PNG.sync.read(bufferA);
  let b: PNG = PNG.sync.read(bufferB);

  if (a.width !== b.width || a.height !== b.height) {
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);
    a = padImage(a, width, height);
    b = padImage(b, width, height);
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const mismatchedPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: options.pixelThreshold ?? 0.1,
    includeAA: false
  });

  const diffPercent = (mismatchedPixels / (a.width * a.height)) * 100;
  return {
    result: {
      diffPercent,
      mismatchedPixels,
      width: a.width,
      height: a.height
    },
    diffPng: PNG.sync.write(diff)
  };
}

/** Diff two PNG files and write the diff image to `outPath`. */
export async function diffPngFiles(
  pathA: string,
  pathB: string,
  outPath: string,
  options: DiffOptions = {}
): Promise<DiffResult> {
  const [bufferA, bufferB] = await Promise.all([fs.readFile(pathA), fs.readFile(pathB)]);
  const { result, diffPng } = diffPngBuffers(bufferA, bufferB, options);
  await fs.writeFile(outPath, diffPng);
  return result;
}

function padImage(original: PNG, width: number, height: number): PNG {
  if (original.width === width && original.height === height) return original;

  const padded = new PNG({ width, height });
  padded.data.fill(255); // white, fully opaque

  for (let y = 0; y < original.height; y++) {
    const srcStart = original.width * y * 4;
    const destStart = width * y * 4;
    original.data.copy(padded.data, destStart, srcStart, srcStart + original.width * 4);
  }
  return padded;
}
