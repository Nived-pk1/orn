/** The search port's index state (palette wait fix, step 6.1b part 1): a change not yet sent to the index is never read as final. */
import { describe, expect, it } from 'vitest';
import type { SearchSyncStatus } from '@/workers/search';
import { indexStateOf } from './search-port';

const status = (over: Partial<SearchSyncStatus>): SearchSyncStatus => ({ state: 'idle', indexRevision: 7, queued: 0, backlog: 0, loadPending: false, reason: '', ...over });

describe('indexStateOf', () => {
  it('no search worker: current (the search answers NOT_READY itself)', () => {
    expect(indexStateOf(undefined, 7)).toEqual({ state: 'current' });
  });
  it('idle at the store revision: current', () => {
    expect(indexStateOf(status({}), 7)).toEqual({ state: 'current' });
  });
  it('a change waiting, or the index at an older revision or not loaded yet: catching up', () => {
    expect(indexStateOf(status({ state: 'pending', queued: 1 }), 7)).toEqual({ state: 'catching_up' });
    expect(indexStateOf(status({ indexRevision: 6 }), 7)).toEqual({ state: 'catching_up' });
    expect(indexStateOf(status({ indexRevision: null, loadPending: true }), 7)).toEqual({ state: 'catching_up' });
  });
  it('a failed sync: failed, with its reason (or words when it has none)', () => {
    expect(indexStateOf(status({ state: 'down', reason: 'update failed: TIMEOUT: x' }), 7)).toEqual({ state: 'failed', reason: 'update failed: TIMEOUT: x' });
    expect(indexStateOf(status({ state: 'down' }), 7)).toEqual({ state: 'failed', reason: 'the search worker failed' });
  });
});
