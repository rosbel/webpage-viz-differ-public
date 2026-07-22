import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearRunOwner, reconcileInterruptedRuns, recordRunOwner } from './recovery.js';
import { VizDiffStore } from './store/index.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('run ownership recovery', () => {
  it('marks a run failed only after its owner process exits', () => {
    const outputDir = makeOutputDirectory();
    const store = new VizDiffStore(path.join(outputDir, 'vizdiff.db'));
    const liveRun = createRun(store);
    const interruptedRun = createRun(store);

    recordRunOwner(outputDir, liveRun, process.pid);
    recordRunOwner(outputDir, interruptedRun, 2_147_483_647);
    reconcileInterruptedRuns(store, outputDir);

    expect(store.getRun(liveRun)?.status).toBe('running');
    expect(store.getRun(interruptedRun)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('process exited')
    });
    expect(readFileSync(path.join(outputDir, '.run-owners', `${liveRun}.json`), 'utf8')).toContain(
      String(process.pid)
    );
    clearRunOwner(outputDir, liveRun);
    store.close();
  });

  it('does not mistake a reused pid with a stale heartbeat for the owner', () => {
    const outputDir = makeOutputDirectory();
    const store = new VizDiffStore(path.join(outputDir, 'vizdiff.db'));
    const runId = createRun(store);

    recordRunOwner(outputDir, runId, process.pid, Date.now() - 10 * 60_000);
    reconcileInterruptedRuns(store, outputDir);

    expect(store.getRun(runId)).toMatchObject({ status: 'failed' });
    store.close();
  });
});

function makeOutputDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'vizdiff-recovery-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createRun(store: VizDiffStore): number {
  return store.createRun({ baseA: 'https://a.test', baseB: 'https://b.test', configJson: '{}' }).id;
}
