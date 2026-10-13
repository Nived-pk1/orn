/** The worker health sink: a response whose call is no longer pending is ignored and named in the event log (5.10a review). */
import { describe, expect, it, vi } from 'vitest';
import { createEventLog, createStatusStore } from './status';
import { createWorkerHealth } from './worker-health';

describe('worker health', () => {
  it('records a duplicate or late response with the worker name and id, and writes nothing to the console', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = createEventLog(() => 0);
    const health = createWorkerHealth('search', createStatusStore(() => undefined), log);
    health.onEvent({ type: 'dropped_response', id: 3, reason: 'unknown' });
    health.onEvent({ type: 'dropped_response', id: 4, method: 'add', reason: 'timeout' });
    expect(log.get().map((entry) => (entry.event as { message?: string }).message)).toEqual([
      'duplicate or late worker response (worker search, id 3)',
      'duplicate or late worker response (worker search, id 4)',
    ]);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('a malformed response is still logged as the worker event', () => {
    const log = createEventLog(() => 0);
    createWorkerHealth('search', createStatusStore(() => undefined), log).onEvent({ type: 'dropped_response', id: -1, reason: 'malformed' });
    expect(log.get()[0]?.source).toBe('worker');
  });
});
