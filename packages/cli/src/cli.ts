#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  fetchSitemapPaths,
  loadConfig,
  runComparison,
  VizDiffStore,
  type PageResult,
  type RunSummary
} from '@webpage-viz-differ/core';
import { reconcileInterruptedRuns } from '@webpage-viz-differ/core/recovery';

const program = new Command();

program
  .name('vizdiff')
  .description(
    'Visual comparison between two live sites — verify a migration did not change the pixels'
  );

program
  .command('init')
  .description('create a starter vizdiff.config.ts in the current directory')
  .option('--force', 'overwrite an existing config')
  .action((options: { force?: boolean }) => {
    const target = path.resolve('vizdiff.config.ts');
    if (existsSync(target) && !options.force) {
      fail(`${path.basename(target)} already exists (use --force to overwrite)`);
    }
    writeFileSync(target, CONFIG_TEMPLATE);
    console.log(`${pc.green('created')} ${path.basename(target)}`);
    console.log(`Edit baseA/baseB/paths, then run ${pc.bold('vizdiff run')}.`);
  });

program
  .command('sitemap')
  .description('list site paths from a sitemap.xml (paste into config, or use --out + pathsFile)')
  .argument('<url>', 'sitemap URL, or a site origin (assumes /sitemap.xml)')
  .option('--limit <n>', 'max paths to collect', '500')
  .option('--out <file>', 'write paths to a JSON file instead of stdout')
  .action(async (url: string, options: { limit: string; out?: string }) => {
    const paths = await fetchSitemapPaths(url, { limit: Number(options.limit) });
    if (paths.length === 0) fail('no paths found in sitemap');
    const json = JSON.stringify(paths, null, 2);
    if (options.out) {
      writeFileSync(path.resolve(options.out), json + '\n');
      console.log(
        `${pc.green('wrote')} ${paths.length} paths to ${options.out} — reference it from the config with ${pc.bold(`pathsFile: '${options.out}'`)}`
      );
    } else {
      console.log(json);
    }
  });

program
  .command('run')
  .description('compare the two configured sites and store the results')
  .option('-c, --config <file>', 'config file (default: vizdiff.config.{ts,js,mjs,json})')
  .action(async (options: { config?: string }) => {
    const { config, configPath } = await loadConfig(options.config);
    console.log(
      `Comparing ${pc.cyan(config.baseA)} vs ${pc.cyan(config.baseB)} — ` +
        `${config.paths.length} paths × ${config.viewports.length} viewports ` +
        pc.dim(`(${path.relative(process.cwd(), configPath)})`)
    );

    let summary: RunSummary | undefined;
    const report = await runComparison(config, {
      onProgress: (event) => {
        if (event.type === 'page-completed') {
          console.log(formatPageLine(event.result, event.index, event.total));
        } else if (event.type === 'run-finished') {
          summary = event.summary;
        }
      }
    });
    summary ??= report.summary;

    printSummary(summary, config.outputDir);
    if (summary.passed === false) process.exitCode = 1;
  });

program
  .command('list')
  .description('show recent runs')
  .option('-o, --output <dir>', 'output dir containing vizdiff.db', '.vizdiff')
  .option('--limit <n>', 'max runs to show', '20')
  .action((options: { output: string; limit: string }) => {
    const dbPath = path.resolve(options.output, 'vizdiff.db');
    if (!existsSync(dbPath)) fail(`no run database at ${dbPath} — run \`vizdiff run\` first`);
    const store = new VizDiffStore(dbPath);
    try {
      reconcileInterruptedRuns(store, path.resolve(options.output));
      const runs = store.listRuns(Number(options.limit));
      if (runs.length === 0) {
        console.log('no runs yet');
        return;
      }
      for (const run of runs) {
        const when = run.startedAt.toISOString().replace('T', ' ').slice(0, 16);
        const status =
          run.status === 'completed'
            ? pc.green(run.status)
            : run.status === 'failed'
              ? pc.red(run.status)
              : pc.yellow(run.status);
        const worst = run.maxDiffPercent === null ? '-' : `${run.maxDiffPercent.toFixed(2)}%`;
        console.log(
          `#${run.id}  ${when}  ${status}  ${run.baseA} vs ${run.baseB}  ` +
            `pages: ${run.total}  worst: ${worst}` +
            (run.errors > 0 ? `  ${pc.red(`errors: ${run.errors}`)}` : '')
        );
      }
    } finally {
      store.close();
    }
  });

function formatPageLine(result: PageResult, index: number, total: number): string {
  const counter = pc.dim(`[${String(index).padStart(String(total).length)}/${total}]`);
  const page = `${result.path} ${pc.dim(`@ ${result.viewport.name}`)}`;
  switch (result.status) {
    case 'ok':
      return `${counter} ${pc.green('✓')} ${page} ${result.diffPercent?.toFixed(2)}%`;
    case 'over-threshold':
      return `${counter} ${pc.red('✗')} ${page} ${pc.red(`${result.diffPercent?.toFixed(2)}% over threshold`)}`;
    case 'expected-different':
      return `${counter} ${pc.yellow('≈')} ${page} ${result.diffPercent?.toFixed(2)}% ${pc.dim('(expected different)')}`;
    case 'error':
      return `${counter} ${pc.red('!')} ${page} ${pc.red(result.error ?? 'error')}`;
  }
}

function printSummary(summary: RunSummary, outputDir: string): void {
  const seconds = (summary.durationMs / 1000).toFixed(1);
  console.log('');
  console.log(
    `Run #${summary.runId}: ${summary.total} pages in ${seconds}s — ` +
      `worst diff ${summary.maxDiffPercent.toFixed(2)}%` +
      (summary.errors > 0 ? `, ${pc.red(`${summary.errors} errors`)}` : '')
  );
  if (summary.passed === null) {
    console.log(pc.dim('report-only (no threshold configured) — inspect results in the web UI'));
  } else if (summary.passed) {
    console.log(
      pc.green('PASS — no completed page exceeded its threshold') +
        (summary.errors > 0
          ? pc.yellow(` (${summary.errors} capture errors reported separately)`)
          : '')
    );
  } else {
    console.log(
      pc.red(`FAIL — ${summary.overThreshold} pages over threshold, ${summary.errors} errors`)
    );
  }
  console.log(pc.dim(`images + database in ${outputDir}`));
}

function fail(message: string): never {
  console.error(pc.red(message));
  process.exit(1);
}

const CONFIG_TEMPLATE = `import { defineConfig } from '@webpage-viz-differ/core';

export default defineConfig({
  // The site being migrated away from…
  baseA: 'https://old.example.com',
  // …and the new one that should look identical.
  baseB: 'https://new.example.com',

  // Paths compared on both origins. Generate with: vizdiff sitemap <url> --out paths.json
  paths: ['/'],
  // pathsFile: 'paths.json',

  // viewports: [
  //   { name: 'desktop', width: 1440, height: 900 },
  //   { name: 'mobile', width: 390, height: 844 }
  // ],

  // Mask dynamic regions (dates, ads, chat widgets) before diffing:
  // mask: { global: ['.cookie-banner'], perPath: { '/': ['.hero-carousel'] } },

  // Report-only by default. Uncomment to gate CI (exit 1 when exceeded):
  // threshold: { maxDiffPercent: 0.1, perPath: { '/redesigned-page': 'expected-different' } },

  outputDir: '.vizdiff'
});
`;

await program.parseAsync();
