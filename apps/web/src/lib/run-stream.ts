import {
  progressEventSchema,
  runStatusSchema,
  type ProgressEvent,
  type RunStatus
} from '@webpage-viz-differ/core/wire';
import { z } from 'zod';

const runStreamEventSchema: z.ZodType<
  ProgressEvent | { type: 'run-error'; message: string } | { type: 'not-live'; status: RunStatus }
> = z.union([
  progressEventSchema,
  z.object({ type: z.literal('run-error'), message: z.string() }),
  z.object({ type: z.literal('not-live'), status: runStatusSchema })
]);

export type RunStreamEvent = z.infer<typeof runStreamEventSchema>;

export function parseRunStreamEvent(data: string): RunStreamEvent | null {
  try {
    const parsed = runStreamEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
