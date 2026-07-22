import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import type { VizDiffStore } from './store/index.js';

const OWNER_DIRECTORY = '.run-owners';
const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_STALE_MS = 5 * 60_000;
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

/** Persist enough ownership information to recover a run after an abrupt process exit. */
export function recordRunOwner(
  outputDir: string,
  runId: number,
  pid = process.pid,
  heartbeatAt = Date.now()
): void {
  const directory = path.join(outputDir, OWNER_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const filePath = ownerPath(outputDir, runId);
  writeOwner(filePath, pid, heartbeatAt);

  const existingTimer = heartbeatTimers.get(filePath);
  if (existingTimer) clearInterval(existingTimer);
  const timer = setInterval(() => {
    try {
      writeOwner(filePath, pid, Date.now());
    } catch {
      // The terminal DB update still proceeds; interruption recovery is best-effort.
    }
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  heartbeatTimers.set(filePath, timer);
}

/** Remove ownership metadata after a run reaches a terminal state. */
export function clearRunOwner(outputDir: string, runId: number): void {
  const filePath = ownerPath(outputDir, runId);
  const timer = heartbeatTimers.get(filePath);
  if (timer) clearInterval(timer);
  heartbeatTimers.delete(filePath);
  rmSync(filePath, { force: true });
}

/** Mark only runs whose recorded owner process has exited as interrupted. */
export function reconcileInterruptedRuns(store: VizDiffStore, outputDir: string): void {
  const directory = path.join(outputDir, OWNER_DIRECTORY);
  if (!existsSync(directory)) return;

  for (const entry of readdirSync(directory)) {
    const match = /^(\d+)\.json$/.exec(entry);
    if (!match) continue;
    const runId = Number(match[1]);
    const filePath = path.join(directory, entry);

    let pid: number;
    let heartbeatAt: number;
    try {
      const owner = JSON.parse(readFileSync(filePath, 'utf8')) as {
        pid?: unknown;
        heartbeatAt?: unknown;
      };
      if (!Number.isInteger(owner.pid) || Number(owner.pid) <= 0) throw new Error('invalid pid');
      if (typeof owner.heartbeatAt !== 'number' || !Number.isFinite(owner.heartbeatAt)) {
        throw new Error('invalid heartbeat');
      }
      pid = Number(owner.pid);
      heartbeatAt = Number(owner.heartbeatAt);
    } catch {
      rmSync(filePath, { force: true });
      continue;
    }

    const run = store.getRun(runId);
    if (!run || run.status !== 'running') {
      clearRunOwner(outputDir, runId);
      continue;
    }
    if (isProcessAlive(pid) && Date.now() - heartbeatAt <= HEARTBEAT_STALE_MS) continue;

    store.finishRun(runId, 'failed', 'comparison interrupted because its process exited');
    clearRunOwner(outputDir, runId);
  }
}

function writeOwner(filePath: string, pid: number, heartbeatAt: number): void {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify({ pid, heartbeatAt }) + '\n', 'utf8');
  renameSync(temporaryPath, filePath);
}

function ownerPath(outputDir: string, runId: number): string {
  if (!Number.isInteger(runId) || runId <= 0) throw new Error('run id must be a positive integer');
  return path.join(outputDir, OWNER_DIRECTORY, `${runId}.json`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
