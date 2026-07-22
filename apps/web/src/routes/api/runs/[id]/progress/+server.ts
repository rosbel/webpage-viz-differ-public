import { error } from '@sveltejs/kit';
import { getLiveRun, getStore } from '$lib/server/vizdiff';
import type { RequestHandler } from './$types';

/**
 * SSE stream of a run's progress. Replays everything that already happened in
 * this process, then forwards live events until the run finishes. For runs
 * that are not live (finished earlier, or the server restarted) a single
 * snapshot event is sent so clients can fall back to the database state.
 */
export const GET: RequestHandler = ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw error(400, 'invalid run id');

  const live = getLiveRun(id);
  const encoder = new TextEncoder();

  if (!live) {
    const run = getStore().getRun(id);
    if (!run) throw error(404, 'run not found');
    const body = encoder.encode(sseMessage({ type: 'not-live', status: run.status }));
    return sseResponse(new ReadableStream({ start: (c) => (c.enqueue(body), c.close()) }));
  }

  let unsubscribe: (() => void) | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(sseMessage(event)));
      for (const event of live.replay) send(event);
      if (live.done) {
        controller.close();
        return;
      }
      unsubscribe = live.subscribe((event) => {
        send(event);
        if (event.type === 'run-finished' || event.type === 'run-error') {
          unsubscribe?.();
          controller.close();
        }
      });
    },
    cancel() {
      unsubscribe?.();
    }
  });

  return sseResponse(stream);
};

function sseMessage(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
