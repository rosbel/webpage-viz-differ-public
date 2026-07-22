import { json } from '@sveltejs/kit';
import { configSchema, resolveConfig } from '@webpage-viz-differ/core';
import { z, ZodError } from 'zod';
import { RunCapacityError, startRun } from '$lib/server/vizdiff';
import type { RequestHandler } from './$types';

const requestSchema = z.object({
  name: configSchema.shape.name,
  baseA: z.preprocess(trimString, configSchema.shape.baseA),
  baseB: z.preprocess(trimString, configSchema.shape.baseB),
  paths: z.preprocess(normalizePaths, configSchema.shape.paths),
  viewports: configSchema.shape.viewports,
  // These two fields are web-form conveniences. resolveConfig applies the
  // canonical selector and threshold constraints after they are reshaped.
  maskSelectors: z.array(z.string()).optional(),
  maxDiffPercent: z.number().optional()
});

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, { status: 400 });
  }

  let config;
  try {
    const input = requestSchema.parse(body);
    config = resolveConfig({
      name: input.name,
      baseA: input.baseA,
      baseB: input.baseB,
      paths: input.paths,
      viewports: input.viewports,
      mask: { global: input.maskSelectors ?? [] },
      threshold:
        input.maxDiffPercent === undefined ? undefined : { maxDiffPercent: input.maxDiffPercent }
    });
  } catch (error) {
    return validationError(error);
  }

  try {
    const runId = await startRun(config);
    return json({ id: runId }, { status: 201 });
  } catch (error) {
    if (error instanceof RunCapacityError) {
      return json({ error: error.message }, { status: 429, headers: { 'Retry-After': '5' } });
    }
    return json(
      { error: error instanceof Error ? error.message : 'failed to start run' },
      { status: 500 }
    );
  }
};

function validationError(error: unknown) {
  const message =
    error instanceof ZodError
      ? error.issues
          .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
          .join('; ')
      : error instanceof Error
        ? error.message
        : 'invalid run configuration';
  return json({ error: message }, { status: 400 });
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizePaths(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((entry) => (typeof entry === 'string' ? normalizePath(entry) : entry))
    : value;
}
