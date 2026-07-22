import { promises as fs } from 'node:fs';
import { error } from '@sveltejs/kit';
import { resolveOutputPath } from '@webpage-viz-differ/core';
import { outputDir } from '$lib/server/vizdiff';
import type { RequestHandler } from './$types';

/**
 * Serves run images from the output directory at request time. (Screenshots
 * are written while the app runs, so they can't be static build assets.)
 */
export const GET: RequestHandler = async ({ params }) => {
  let resolved: string;
  try {
    resolved = resolveOutputPath(outputDir, params.file);
  } catch {
    throw error(403, 'forbidden');
  }
  if (!resolved.endsWith('.png')) throw error(404, 'not found');

  try {
    const buffer = await fs.readFile(resolved);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        // Run directories are append-only; images never change once written.
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch {
    throw error(404, 'not found');
  }
};
