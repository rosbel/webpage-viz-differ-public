export {
  configSchema,
  defineConfig,
  loadConfig,
  resolveConfig,
  effectiveThreshold,
  maskSelectorsFor,
  DEFAULT_VIEWPORTS,
  MAX_PATHS,
  type LoadedConfig,
  type PathThreshold,
  type ResolvedConfig,
  type Viewport,
  type VizDiffConfig
} from './config.js';
export { capturePage, type CaptureOptions } from './capture.js';
export { diffPngBuffers, diffPngFiles, type DiffOptions, type DiffResult } from './diff.js';
export { fetchSitemapPaths, parseSitemapXml, type SitemapOptions } from './sitemap.js';
export {
  VizDiffStore,
  type PageResultRow,
  type RunAggregates,
  type RunListItem,
  type RunRow
} from './store/index.js';
export {
  evaluateStatus,
  resolveOutputPath,
  runComparison,
  slugifyPath,
  type RunOptions
} from './runner.js';
export type {
  PageResult,
  PageStatus,
  ProgressEvent,
  RunReport,
  RunStatus,
  RunSummary
} from './types.js';
