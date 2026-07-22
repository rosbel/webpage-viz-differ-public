# webpage-viz-differ Development Guidelines

Visual comparison between two live sites (Playwright + pixelmatch), built for framework/platform migrations. pnpm workspace monorepo:

- `packages/core` — engine: config (zod), capture, diff, SQLite store (Drizzle + better-sqlite3), sitemap import, run orchestrator
- `packages/cli` — `vizdiff` bin over core
- `apps/web` — SvelteKit app (Svelte 5, Tailwind 4, adapter-node): triggers runs, SSE progress, diff viewer

Core must be built (`pnpm --filter @webpage-viz-differ/core build`) before the web app or CLI can consume changes — workspace deps resolve to `dist/`.

## Commands (run from repo root)

- `pnpm dev`: build core, start web dev server
- `pnpm build`: build all packages
- `pnpm typecheck`: tsc (core/cli) + svelte-check (web)
- `pnpm lint` / `pnpm format`: prettier + eslint (flat config at root)
- `pnpm test:unit`: core unit tests (Vitest)
- `pnpm test:unit -- src/path/file.spec.ts`: single unit test file
- `pnpm test:e2e`: web e2e tests (Playwright, boots dev server on :4173)

One-time: `pnpm --filter @webpage-viz-differ/core exec playwright install chromium`

## Conventions

- TypeScript strict everywhere; core/cli use NodeNext modules with `.js` import specifiers
- Svelte 5 runes (`$props()`, `$state`, `$derived`, `$effect`); `onclick` not `on:click`
- Navigation uses `resolve()` from `$app/paths` (enforced by eslint-plugin-svelte)
- Unit tests are `.spec.ts` colocated in `src/`; e2e tests are `.test.ts` in `apps/web/e2e/`
- No env vars required; run output defaults to `.vizdiff/` (gitignored)
- Store schema changes: update both the Drizzle schema and the hand-written DDL in `packages/core/src/store/index.ts` (schema is created on open; no migrations)
