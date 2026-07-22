import { json } from '@sveltejs/kit';
import { fetchSitemapPaths } from '@webpage-viz-differ/core';
import { z, ZodError } from 'zod';
import type { RequestHandler } from './$types';

const requestSchema = z.object({ url: z.string().min(1).max(2_048) });

export const POST: RequestHandler = async ({ request }) => {
  let target: string;
  try {
    target = requestSchema.parse(await request.json()).url;
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : 'invalid JSON body';
    return json({ error: message ?? 'invalid sitemap request' }, { status: 400 });
  }

  try {
    const paths = await fetchSitemapPaths(target, { limit: 500 });
    return json({ paths });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'sitemap fetch failed' },
      { status: 502 }
    );
  }
};
