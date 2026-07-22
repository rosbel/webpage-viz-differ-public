import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  baseA: text('base_a').notNull(),
  baseB: text('base_b').notNull(),
  status: text('status').$type<'running' | 'completed' | 'failed'>().notNull().default('running'),
  configJson: text('config_json').notNull(),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' })
});

export const pageResults = sqliteTable(
  'page_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    viewport: text('viewport').notNull(),
    viewportWidth: integer('viewport_width').notNull(),
    viewportHeight: integer('viewport_height').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    diffPercent: real('diff_percent'),
    status: text('status')
      .$type<'ok' | 'over-threshold' | 'expected-different' | 'error'>()
      .notNull(),
    error: text('error'),
    screenshotA: text('screenshot_a'),
    screenshotB: text('screenshot_b'),
    diffImage: text('diff_image'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [index('idx_page_results_run_id').on(table.runId)]
);

export type RunRow = typeof runs.$inferSelect;
export type PageResultRow = typeof pageResults.$inferSelect;
