import { describe, expect, it, vi } from 'vitest';
import { EVENT_LOG_LIMIT, INITIAL_STATUS, createEventLog, createStatusStore, sameValue, type AppStatus } from './status';

describe('AppStatus store: one immutable value that changes identity only when a field changes', () => {
  it('starts as the frozen initial value', () => {
    const store = createStatusStore(() => undefined);
    expect(store.get()).toBe(INITIAL_STATUS);
    expect(Object.isFrozen(store.get())).toBe(true);
    expect(store.get()).toMatchObject({ stage: 'booting', mode: null, save: null, replica: { state: 'absent' } });
  });

  it('a patch that changes nothing keeps the identity and tells nobody', () => {
    const store = createStatusStore(() => undefined);
    const seen = vi.fn();
    store.subscribe(seen);
    store.update({ mode: 'writer', save: { state: 'saved', lastSavedRevision: 1, pendingRevisions: 0, lastError: null, failureReason: null, deletablePeriodicSnapshotIds: [] } });
    const first = store.get();
    seen.mockClear();
    expect(store.update({ mode: 'writer' })).toBe(false);
    expect(store.update({ save: { state: 'saved', lastSavedRevision: 1, pendingRevisions: 0, lastError: null, failureReason: null, deletablePeriodicSnapshotIds: [] } })).toBe(false);
    expect(store.update({})).toBe(false);
    expect(store.get()).toBe(first);
    expect(seen).not.toHaveBeenCalled();
  });

  it('a patch that changes one field gives a new frozen value, keeps the untouched fields identical and tells every subscriber once', () => {
    const store = createStatusStore(() => undefined);
    store.update({ replica: { state: 'in_sync', reason: 'x', revision: 1 } });
    const before = store.get();
    const one = vi.fn();
    const two = vi.fn();
    store.subscribe(one);
    const stop = store.subscribe(two);
    expect(store.update({ mode: 'follower' })).toBe(true);
    const after = store.get();
    expect(after).not.toBe(before);
    expect(after.replica).toBe(before.replica);
    expect(Object.isFrozen(after)).toBe(true);
    expect(one).toHaveBeenCalledTimes(1);
    expect(one).toHaveBeenCalledWith(after);
    stop();
    store.update({ mode: 'writer' });
    expect(one).toHaveBeenCalledTimes(2);
    expect(two).toHaveBeenCalledTimes(1);
  });

  it('values put into a status are frozen all the way down', () => {
    const store = createStatusStore(() => undefined);
    const ids = ['a'];
    store.update({ save: { state: 'failed', lastSavedRevision: 1, pendingRevisions: 2, lastError: 'x', failureReason: null, deletablePeriodicSnapshotIds: ids } });
    expect(Object.isFrozen((store.get().save as NonNullable<AppStatus['save']>).deletablePeriodicSnapshotIds)).toBe(true);
  });

  it('a listener that throws is reported and does not stop the others', () => {
    const reported: unknown[] = [];
    const store = createStatusStore((error) => reported.push(error));
    const after = vi.fn();
    store.subscribe(() => {
      throw new Error('listener failed');
    });
    store.subscribe(after);
    store.update({ mode: 'writer' });
    expect(after).toHaveBeenCalledTimes(1);
    expect(reported).toHaveLength(1);
  });

  it('clear() removes every subscriber', () => {
    const store = createStatusStore(() => undefined);
    const seen = vi.fn();
    store.subscribe(seen);
    store.clear();
    store.update({ mode: 'writer' });
    expect(seen).not.toHaveBeenCalled();
  });

  it('sameValue compares plain values structurally', () => {
    expect(sameValue({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue([1, 2], [1])).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue(Number.NaN, Number.NaN)).toBe(true);
  });
});

describe('the event log is a bounded ring', () => {
  it(`keeps the newest ${EVENT_LOG_LIMIT} entries, counts what it dropped and keeps sequence numbers`, () => {
    let now = 0;
    const log = createEventLog(() => (now += 1));
    const empty = log.get();
    for (let i = 0; i < EVENT_LOG_LIMIT + 25; i += 1) log.add({ source: 'app', event: { type: 'note', message: `n${i}` } });
    expect(empty).toHaveLength(0);
    expect(log.get()).toHaveLength(EVENT_LOG_LIMIT);
    expect(log.dropped()).toBe(25);
    const entries = log.get();
    expect(entries[0]).toMatchObject({ seq: 26, event: { message: 'n25' } });
    expect(entries[entries.length - 1]).toMatchObject({ seq: EVENT_LOG_LIMIT + 25, event: { message: `n${EVENT_LOG_LIMIT + 24}` } });
    expect(Object.isFrozen(entries)).toBe(true);
  });

  it('the array keeps its identity until the next entry; subscribers are told; a throwing subscriber is ignored', () => {
    const log = createEventLog(() => 1, 3);
    const seen = vi.fn();
    log.subscribe(() => {
      throw new Error('x');
    });
    log.subscribe(seen);
    const first = log.get();
    expect(log.get()).toBe(first);
    log.add({ source: 'app', event: { type: 'a', message: 'a' } });
    expect(log.get()).not.toBe(first);
    expect(seen).toHaveBeenCalledTimes(1);
    log.clear();
    log.add({ source: 'app', event: { type: 'b', message: 'b' } });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
