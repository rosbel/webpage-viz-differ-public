import { error } from '@sveltejs/kit';
import { getStore } from '$lib/server/vizdiff';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw error(404, 'run not found');

  const store = getStore();
  const run = store.getRun(id);
  if (!run) throw error(404, 'run not found');

  let expectedTotal = 0;
  try {
    const config = JSON.parse(run.configJson) as { paths?: string[]; viewports?: unknown[] };
    expectedTotal = (config.paths?.length ?? 0) * (config.viewports?.length ?? 0);
  } catch {
    // legacy/malformed config: progress bar falls back to indeterminate
  }

  return { run, results: store.getRunResults(id), expectedTotal };
};
