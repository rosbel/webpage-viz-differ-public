import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import { diffPngBuffers, diffPngFiles } from './diff.js';

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

const red: [number, number, number] = [255, 0, 0];
const blue: [number, number, number] = [0, 0, 255];

describe('diffPngBuffers', () => {
  it('reports 0% for identical images', () => {
    const image = solidPng(10, 10, red);
    const { result } = diffPngBuffers(image, image);
    expect(result.diffPercent).toBe(0);
    expect(result.mismatchedPixels).toBe(0);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it('reports 100% for fully different images', () => {
    const { result } = diffPngBuffers(solidPng(10, 10, red), solidPng(10, 10, blue));
    expect(result.diffPercent).toBe(100);
  });

  it('preserves sub-hundredth percentages for exact threshold evaluation', () => {
    const imageA = PNG.sync.read(solidPng(1000, 1000, red));
    const imageB = PNG.sync.read(solidPng(1000, 1000, red));
    imageB.data[0] = 0;

    const { result } = diffPngBuffers(PNG.sync.write(imageA), PNG.sync.write(imageB));
    expect(result.mismatchedPixels).toBe(1);
    expect(result.diffPercent).toBeCloseTo(0.0001, 8);
  });

  it('pads mismatched dimensions instead of crashing', () => {
    // 10x10 red vs 10x20 red: the extra 100 rows of B differ from white padding of A
    const { result } = diffPngBuffers(solidPng(10, 10, red), solidPng(10, 20, red));
    expect(result.width).toBe(10);
    expect(result.height).toBe(20);
    expect(result.diffPercent).toBe(50);
  });

  it('produces a decodable diff image', () => {
    const { diffPng } = diffPngBuffers(solidPng(4, 4, red), solidPng(4, 4, blue));
    const decoded = PNG.sync.read(diffPng);
    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(4);
  });
});

describe('diffPngFiles', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vizdiff-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads inputs and writes the diff image', async () => {
    const { writeFileSync, existsSync } = await import('node:fs');
    const aPath = path.join(dir, 'a.png');
    const bPath = path.join(dir, 'b.png');
    const outPath = path.join(dir, 'diff.png');
    writeFileSync(aPath, solidPng(8, 8, red));
    writeFileSync(bPath, solidPng(8, 8, red));

    const result = await diffPngFiles(aPath, bPath, outPath);
    expect(result.diffPercent).toBe(0);
    expect(existsSync(outPath)).toBe(true);
  });
});
