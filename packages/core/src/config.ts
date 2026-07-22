import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import { z } from 'zod';
import { viewportSchema } from './types.js';
import { isHttpUrlWithoutCredentials } from './url.js';

export { viewportSchema } from './types.js';

const httpUrl = z
  .string()
  .max(2_048)
  .refine(isHttpUrlWithoutCredentials, {
    message: 'must be an absolute http(s) URL without embedded credentials'
  })
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.pathname === '/' && url.search === '' && url.hash === '';
      } catch {
        return false;
      }
    },
    { message: 'must be an origin without a path, query, or fragment' }
  );

const sitePath = z
  .string()
  .min(1)
  .max(2_048)
  .refine((value) => value.startsWith('/'), { message: 'paths must start with "/"' })
  .refine(
    (value) => {
      try {
        return new URL(value, 'https://vizdiff.invalid').origin === 'https://vizdiff.invalid';
      } catch {
        return false;
      }
    },
    { message: 'paths must stay on the configured origin' }
  );

const viewportsSchema = z
  .array(viewportSchema)
  .min(1)
  .max(20)
  .superRefine((viewports, ctx) => {
    const seen = new Set<string>();
    for (const [index, viewport] of viewports.entries()) {
      if (seen.has(viewport.name)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: 'viewport names must be unique'
        });
      }
      seen.add(viewport.name);
    }
  });

export const MAX_PATHS = 1_000;
export const MAX_RUN_JOBS = 2_000;

export const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];

const pathThresholdSchema = z.union([z.number().min(0).max(100), z.literal('expected-different')]);

export const configSchema = z.object({
  /** Display name for runs created from this config. */
  name: z.string().max(100).optional(),
  /** Base origin of the reference site (e.g. the site being migrated away from). */
  baseA: httpUrl,
  /** Base origin of the candidate site (e.g. the new platform). */
  baseB: httpUrl,
  /** Paths compared on both origins. Merged with `pathsFile` when both are set. */
  paths: z.array(sitePath).max(MAX_PATHS).default([]),
  /** Optional JSON file containing an array of paths (e.g. produced by `vizdiff sitemap`). */
  pathsFile: z.string().max(4_096).optional(),
  viewports: viewportsSchema.default(DEFAULT_VIEWPORTS),
  mask: z
    .object({
      /** CSS selectors masked on every page before diffing. */
      global: z.array(z.string().min(1).max(1_024)).max(200).default([]),
      /** Extra selectors per path. */
      perPath: z.record(z.string(), z.array(z.string().min(1).max(1_024)).max(200)).default({})
    })
    .default({ global: [], perPath: {} }),
  threshold: z
    .object({
      /**
       * Max allowed diff percent per page. When unset the run is report-only:
       * nothing fails and the CLI always exits 0.
       */
      maxDiffPercent: z.number().min(0).max(100).optional(),
      /** Per-path override: a custom percentage, or 'expected-different' to exempt the page. */
      perPath: z.record(z.string(), pathThresholdSchema).default({})
    })
    .default({ perPath: {} }),
  capture: z
    .object({
      fullPage: z.boolean().default(true),
      /** Navigation timeout; on network-idle timeout the page is captured as-is. */
      timeoutMs: z.number().int().positive().max(120_000).default(30_000),
      /** Scroll through the page before capture so lazy content loads. */
      scrollPrime: z.boolean().default(true),
      /** Pages compared concurrently (each compares two sites at once). */
      concurrency: z.number().int().min(1).max(16).default(3),
      /** pixelmatch per-pixel sensitivity (0 strictest – 1 loosest). */
      pixelThreshold: z.number().min(0).max(1).default(0.1)
    })
    .prefault({}),
  /** Where the SQLite DB and screenshots live. Relative to the config file (or cwd). */
  outputDir: z.string().min(1).max(4_096).default('.vizdiff')
});

export type VizDiffConfig = z.input<typeof configSchema>;
export type ResolvedConfig = z.output<typeof configSchema>;
export type Viewport = z.output<typeof viewportSchema>;
export type PathThreshold = z.output<typeof pathThresholdSchema>;

/** Identity helper so vizdiff.config.ts gets full type checking and completion. */
export function defineConfig(config: VizDiffConfig): VizDiffConfig {
  return config;
}

/**
 * Validate a raw config object and apply defaults. Deduplicates paths and
 * requires at least one path.
 */
export function resolveConfig(raw: unknown): ResolvedConfig {
  const parsed = configSchema.parse(raw);
  parsed.paths = [...new Set(parsed.paths)];
  if (parsed.paths.length === 0 && !parsed.pathsFile) {
    throw new Error('config needs at least one entry in `paths` (or a `pathsFile`)');
  }
  assertRunMatrixLimit(parsed);
  return parsed;
}

const CONFIG_CANDIDATES = [
  'vizdiff.config.ts',
  'vizdiff.config.js',
  'vizdiff.config.mjs',
  'vizdiff.config.json'
];

export interface LoadedConfig {
  config: ResolvedConfig;
  configPath: string;
}

/**
 * Load, validate, and resolve a config file. When `filePath` is omitted the
 * standard candidates are searched in `cwd`. `pathsFile` entries are merged
 * into `paths`, and `outputDir` is resolved relative to the config file.
 */
export async function loadConfig(filePath?: string, cwd = process.cwd()): Promise<LoadedConfig> {
  const configPath = filePath
    ? path.resolve(cwd, filePath)
    : CONFIG_CANDIDATES.map((c) => path.join(cwd, c)).find((c) => existsSync(c));

  if (!configPath || !existsSync(configPath)) {
    throw new Error(
      filePath
        ? `config file not found: ${filePath}`
        : `no config found in ${cwd} (looked for ${CONFIG_CANDIDATES.join(', ')}) — run \`vizdiff init\` to create one`
    );
  }

  let raw: unknown;
  if (configPath.endsWith('.json')) {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } else {
    const jiti = createJiti(import.meta.url);
    const mod = await jiti.import<{ default?: unknown }>(configPath);
    raw = (mod as { default?: unknown }).default ?? mod;
  }

  const configDir = path.dirname(configPath);
  const config = resolveConfig(raw);

  if (config.pathsFile) {
    const pathsFilePath = path.resolve(configDir, config.pathsFile);
    if (!existsSync(pathsFilePath)) {
      throw new Error(`pathsFile not found: ${pathsFilePath}`);
    }
    const filePaths = z
      .array(sitePath)
      .max(MAX_PATHS)
      .parse(JSON.parse(readFileSync(pathsFilePath, 'utf8')));
    config.paths = [...new Set([...config.paths, ...filePaths])];
  }
  if (config.paths.length > MAX_PATHS) {
    throw new Error(`config supports at most ${MAX_PATHS} paths`);
  }
  if (config.paths.length === 0) {
    throw new Error('config needs at least one path after merging `pathsFile`');
  }
  assertRunMatrixLimit(config);

  config.outputDir = path.resolve(configDir, config.outputDir);
  return { config, configPath };
}

function assertRunMatrixLimit(config: Pick<ResolvedConfig, 'paths' | 'viewports'>): void {
  const jobs = config.paths.length * config.viewports.length;
  if (jobs > MAX_RUN_JOBS) {
    throw new Error(`run matrix supports at most ${MAX_RUN_JOBS} path × viewport jobs`);
  }
}

/** The threshold that applies to a path: per-path override, else global, else null (report-only). */
export function effectiveThreshold(
  config: Pick<ResolvedConfig, 'threshold'>,
  sitePathname: string
): PathThreshold | null {
  return config.threshold.perPath[sitePathname] ?? config.threshold.maxDiffPercent ?? null;
}

/** Selectors to mask for a path: global + per-path. */
export function maskSelectorsFor(
  config: Pick<ResolvedConfig, 'mask'>,
  sitePathname: string
): string[] {
  return [...config.mask.global, ...(config.mask.perPath[sitePathname] ?? [])];
}
