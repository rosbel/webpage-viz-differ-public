import { describe, expect, it } from 'vitest';
import { progressEventSchema } from './types.js';

describe('progressEventSchema', () => {
  it('parses runner events shared with SSE clients', () => {
    expect(progressEventSchema.parse({ type: 'run-started', runId: 1, total: 2 })).toEqual({
      type: 'run-started',
      runId: 1,
      total: 2
    });
  });

  it('rejects unknown event variants', () => {
    expect(progressEventSchema.safeParse({ type: 'run-exploded', runId: 1 })).toMatchObject({
      success: false
    });
  });
});
