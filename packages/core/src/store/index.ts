import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { desc, eq, sql } from 'drizzle-orm';
import { pageResults, runs, type PageResultRow, type RunRow } from './schema.js';

export type { PageResultRow, RunRow } from './schema.js';

const DDL = `
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  base_a TEXT NOT NULL,
  base_b TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  config_json TEXT NOT NULL,
  error TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS page_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  viewport TEXT NOT NULL,
  viewport_width INTEGER NOT NULL,
  viewport_height INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  diff_percent REAL,
  status TEXT NOT NULL,
  error TEXT,
  screenshot_a TEXT,
  screenshot_b TEXT,
  diff_image TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_results_run_id ON page_results(run_id);
`;

export interface RunAggregates {
  total: number;
  errors: number;
  overThreshold: number;
  maxDiffPercent: number | null;
}

export type RunListItem = RunRow & RunAggregates;

/**
 * Run history persisted to a single SQLite file. The schema is created on
 * open, so a store works against any path with no migration step.
 */
export class VizDiffStore {
  private sqlite: Database.Database;
  private db: BetterSQLite3Database;

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.exec(DDL);
    this.db = drizzle(this.sqlite);
  }

  createRun(
    input: { name?: string; baseA: string; baseB: string; configJson: string },
    initialize?: (run: RunRow) => void
  ): RunRow {
    return this.sqlite.transaction(() => {
      const [row] = this.db
        .insert(runs)
        .values({
          name: input.name ?? null,
          baseA: input.baseA,
          baseB: input.baseB,
          status: 'running',
          configJson: input.configJson,
          startedAt: new Date()
        })
        .returning()
        .all();
      if (!row) throw new Error('failed to insert run');
      initialize?.(row);
      return row;
    })();
  }

  finishRun(runId: number, status: 'completed' | 'failed', error?: string): void {
    this.db
      .update(runs)
      .set({ status, error: error ?? null, finishedAt: new Date() })
      .where(eq(runs.id, runId))
      .run();
  }

  addPageResult(input: Omit<PageResultRow, 'id' | 'createdAt'>): PageResultRow {
    const [row] = this.db
      .insert(pageResults)
      .values({ ...input, createdAt: new Date() })
      .returning()
      .all();
    if (!row) throw new Error('failed to insert page result');
    return row;
  }

  getRun(runId: number): RunRow | undefined {
    return this.db.select().from(runs).where(eq(runs.id, runId)).get();
  }

  getRunResults(runId: number): PageResultRow[] {
    return this.db
      .select()
      .from(pageResults)
      .where(eq(pageResults.runId, runId))
      .orderBy(pageResults.path, pageResults.viewport)
      .all();
  }

  listRuns(limit = 50): RunListItem[] {
    const runRows = this.db
      .select()
      .from(runs)
      .orderBy(desc(runs.startedAt), desc(runs.id))
      .limit(limit)
      .all();

    const aggregates = this.db
      .select({
        runId: pageResults.runId,
        total: sql<number>`count(*)`,
        errors: sql<number>`sum(case when ${pageResults.status} = 'error' then 1 else 0 end)`,
        overThreshold: sql<number>`sum(case when ${pageResults.status} = 'over-threshold' then 1 else 0 end)`,
        maxDiffPercent: sql<number | null>`max(${pageResults.diffPercent})`
      })
      .from(pageResults)
      .groupBy(pageResults.runId)
      .all();

    const byRunId = new Map(aggregates.map((aggregate) => [aggregate.runId, aggregate]));
    return runRows.map((run) => {
      const aggregate = byRunId.get(run.id);
      return {
        ...run,
        total: aggregate?.total ?? 0,
        errors: aggregate?.errors ?? 0,
        overThreshold: aggregate?.overThreshold ?? 0,
        maxDiffPercent: aggregate?.maxDiffPercent ?? null
      };
    });
  }

  close(): void {
    this.sqlite.close();
  }
}
