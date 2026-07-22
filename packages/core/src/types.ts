import { z } from 'zod';

export const viewportSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/,
      'viewport name must be a lowercase filesystem-safe identifier'
    ),
  width: z.number().int().min(64).max(7_680),
  height: z.number().int().min(64).max(4_320)
});

export const pageStatusSchema = z.enum(['ok', 'over-threshold', 'expected-different', 'error']);
export type PageStatus = z.infer<typeof pageStatusSchema>;

export const runStatusSchema = z.enum(['running', 'completed', 'failed']);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const pageResultSchema = z.object({
  path: z.string(),
  viewport: viewportSchema,
  /** Percent of pixels that differ (0–100), null when capture/diff errored. */
  diffPercent: z.number().min(0).max(100).nullable(),
  status: pageStatusSchema,
  error: z.string().nullable(),
  /** Image locations relative to the run's output dir. Null when capture errored. */
  screenshotA: z.string().nullable(),
  screenshotB: z.string().nullable(),
  diffImage: z.string().nullable(),
  /** Compared dimensions (after padding to the larger of the two captures). */
  width: z.number().int().positive(),
  height: z.number().int().positive()
});
export type PageResult = z.infer<typeof pageResultSchema>;

export const runSummarySchema = z.object({
  runId: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  overThreshold: z.number().int().nonnegative(),
  expectedDifferent: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  maxDiffPercent: z.number().min(0).max(100),
  /** null = report-only run (no threshold configured), otherwise the gate verdict. */
  passed: z.boolean().nullable(),
  durationMs: z.number().nonnegative()
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export interface RunReport {
  runId: number;
  summary: RunSummary;
  results: PageResult[];
}

export const progressEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run-started'),
    runId: z.number().int().positive(),
    total: z.number().int().nonnegative()
  }),
  z.object({
    type: z.literal('page-started'),
    runId: z.number().int().positive(),
    path: z.string(),
    viewport: z.string(),
    index: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
  }),
  z.object({
    type: z.literal('page-completed'),
    runId: z.number().int().positive(),
    result: pageResultSchema,
    index: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
  }),
  z.object({
    type: z.literal('run-finished'),
    runId: z.number().int().positive(),
    summary: runSummarySchema
  })
]);
export type ProgressEvent = z.infer<typeof progressEventSchema>;
