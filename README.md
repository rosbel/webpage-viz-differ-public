# webpage-viz-differ

Visual comparison between **two live sites**. Point it at the site you're migrating away from and the new one, and it screenshots the same paths on both origins with Playwright, diffs every pixel with pixelmatch, and shows you exactly what changed.

Built for framework and platform migrations — Next.js → SvelteKit, WordPress → Astro, monolith → headless — where the pages are supposed to look _identical_ and you need proof across hundreds of URLs and multiple viewports.

No accounts, no cloud services, no env vars: runs are stored in a local SQLite file with the screenshots next to it.

## How it works

For each configured path × viewport, both origins are captured with determinism controls (reduced motion, frozen animations/transitions, fonts loaded, lazy content scroll-primed, dynamic regions masked), then diffed. Results land in `.vizdiff/`:

```
.vizdiff/
├── vizdiff.db                           # run history (SQLite)
└── runs/<id>/<path>-<hash>__<viewport>/
    ├── a.png                     # site A
    ├── b.png                     # site B
    └── diff.png                  # pixel diff
```

By default runs are **report-only**. Configure a threshold and the CLI exits non-zero when any page diffs more than allowed — a CI gate for your migration.

## Quick start (CLI)

```bash
pnpm install
pnpm build
pnpm --filter @webpage-viz-differ/core exec playwright install chromium

cd your-project
node <repo>/packages/cli/dist/cli.js init   # creates vizdiff.config.ts
node <repo>/packages/cli/dist/cli.js run    # compare, store, report
node <repo>/packages/cli/dist/cli.js list   # recent runs
node <repo>/packages/cli/dist/cli.js sitemap https://old.example.com --out paths.json
```

Replace `<repo>` with the absolute path to this checkout. Package publication is intentionally
deferred, so the commands run the locally built CLI directly.

Minimal config (`vizdiff.config.ts`, `.js`, `.mjs`, and `.json` all work):

```ts
import { defineConfig } from '@webpage-viz-differ/core';

export default defineConfig({
  baseA: 'https://old.example.com',
  baseB: 'https://new.example.com',
  paths: ['/', '/pricing', '/blog'],
  // pathsFile: 'paths.json',                       // from `vizdiff sitemap`
  // viewports: [{ name: 'desktop', width: 1440, height: 900 }],
  // mask: { global: ['.cookie-banner'], perPath: { '/': ['.hero-carousel'] } },
  // threshold: { maxDiffPercent: 0.1, perPath: { '/redesigned': 'expected-different' } },
  outputDir: '.vizdiff'
});
```

## Web UI

```bash
pnpm dev   # builds core, starts the SvelteKit app on :5173
```

The web app can do everything the CLI can: configure a comparison (with sitemap import), watch progress stream live, and browse run history with a side-by-side / overlay / diff viewer per page.

The web UI is intentionally **local-only**: it rejects non-loopback clients because it can launch a browser and fetch user-supplied site URLs. Do not expose it through a reverse proxy or public port. Use the CLI for unattended CI runs.

## Monorepo layout

| Package         | What it is                                                                        |
| --------------- | --------------------------------------------------------------------------------- |
| `packages/core` | The engine: config, capture, diff, SQLite store, sitemap import, run orchestrator |
| `packages/cli`  | `vizdiff` — thin CLI over core                                                    |
| `apps/web`      | SvelteKit app: trigger runs, live progress (SSE), diff viewer                     |

## Development

```bash
pnpm build        # build all packages
pnpm test:unit    # core unit tests (Vitest)
pnpm test:e2e     # web app e2e tests (Playwright)
pnpm typecheck    # tsc + svelte-check
pnpm lint         # prettier + eslint
pnpm format
```

Requires Node ≥ 22 and pnpm.

## Security

The web UI is supported only as a loopback-local application. See the
[security policy](.github/SECURITY.md) for vulnerability reporting and the full deployment
boundary.
