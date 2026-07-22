import path from 'node:path';
import {
  runComparison,
  VizDiffStore,
  type ProgressEvent,
  type ResolvedConfig
} from '@webpage-viz-differ/core';
import { reconcileInterruptedRuns } from '@webpage-viz-differ/core/recovery';

/** Where the web app keeps its run database and images. */
export const outputDir = path.resolve(process.cwd(), '.vizdiff');

let storeSingleton: VizDiffStore | null = null;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;
const RECOVERY_RECHECK_MS = 60_000;

export function getStore(): VizDiffStore {
  if (!storeSingleton) {
    storeSingleton = new VizDiffStore(path.join(outputDir, 'vizdiff.db'));
    const store = storeSingleton;
    recoverInterruptedRuns(store);
    recoveryTimer ??= setInterval(() => recoverInterruptedRuns(store), RECOVERY_RECHECK_MS);
    recoveryTimer.unref?.();
  }
  return storeSingleton;
}

function recoverInterruptedRuns(store: VizDiffStore): void {
  try {
    reconcileInterruptedRuns(store, outputDir);
  } catch (error) {
    console.error('failed to reconcile interrupted visual comparison runs', error);
  }
}

/** Progress events forwarded to SSE subscribers, plus a synthetic crash event. */
export type LiveEvent = ProgressEvent | { type: 'run-error'; runId: number; message: string };

interface LiveRun {
  events: LiveEvent[];
  listeners: Set<(event: LiveEvent) => void>;
  done: boolean;
}

const liveRuns = new Map<number, LiveRun>();
const LIVE_RETENTION_MS = 60_000;
const MAX_ACTIVE_RUNS = 1;
let activeRuns = 0;

export class RunCapacityError extends Error {
  constructor() {
    super('a comparison is already running; wait for it to finish before starting another');
    this.name = 'RunCapacityError';
  }
}

/**
 * Start a comparison in the background. Resolves with the run id as soon as
 * the run row exists; progress streams to subscribers via the live-run bus.
 */
export function startRun(config: ResolvedConfig): Promise<number> {
  if (activeRuns >= MAX_ACTIVE_RUNS) return Promise.reject(new RunCapacityError());
  activeRuns++;
  const webConfig = { ...config, outputDir };

  return new Promise((resolve, reject) => {
    let live: LiveRun | undefined;

    const publish = (event: LiveEvent) => {
      if (!live) return;
      live.events.push(event);
      for (const listener of [...live.listeners]) listener(event);
      if (event.type === 'run-finished' || event.type === 'run-error') {
        live.done = true;
        setTimeout(() => liveRuns.delete(event.runId), LIVE_RETENTION_MS).unref?.();
      }
    };

    let comparison: ReturnType<typeof runComparison>;
    try {
      comparison = runComparison(webConfig, {
        store: getStore(),
        onProgress: (event) => {
          if (event.type === 'run-started') {
            live = { events: [], listeners: new Set(), done: false };
            liveRuns.set(event.runId, live);
            resolve(event.runId);
          }
          publish(event);
        }
      });
    } catch (error) {
      activeRuns--;
      reject(error);
      return;
    }

    void comparison
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!live) {
          reject(new Error(message));
          return;
        }
        const started = live.events.find((e) => e.type === 'run-started');
        if (started) publish({ type: 'run-error', runId: started.runId, message });
      })
      .finally(() => {
        activeRuns--;
      });
  });
}

export interface LiveSubscription {
  replay: LiveEvent[];
  done: boolean;
  subscribe: (listener: (event: LiveEvent) => void) => () => void;
}

/** Subscribe to a run that is (or just was) executing in this process. */
export function getLiveRun(runId: number): LiveSubscription | undefined {
  const live = liveRuns.get(runId);
  if (!live) return undefined;
  return {
    replay: [...live.events],
    done: live.done,
    subscribe: (listener) => {
      live.listeners.add(listener);
      return () => live.listeners.delete(listener);
    }
  };
}
