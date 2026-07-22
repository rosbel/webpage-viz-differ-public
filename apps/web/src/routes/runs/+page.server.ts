import { getStore } from '$lib/server/vizdiff';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  return { runs: getStore().listRuns(100) };
};
