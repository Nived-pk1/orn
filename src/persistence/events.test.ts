import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError, isQuotaError, realScheduler } from './events';

afterEach(() => vi.useRealTimers());

describe('isQuotaError', () => {
  it('recognises the browser error and Dexie’s wrapper of it, and nothing else', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'DexieError', inner: { name: 'QuotaExceededError' } })).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
    expect(isQuotaError('QuotaExceededError')).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });

  it('gives up on a cyclic inner chain instead of looping', () => {
    const loop: { name: string; inner?: unknown } = { name: 'x' };
    loop.inner = loop;
    expect(isQuotaError(loop)).toBe(false);
  });
});

describe('describeError', () => {
  it('names the error and truncates a very long message', () => {
    expect(describeError(new RangeError('bad'))).toBe('RangeError: bad');
    expect(describeError('plain')).toBe('plain');
    expect(describeError(new Error('x'.repeat(2000))).length).toBeLessThan(520);
  });
});

describe('realScheduler', () => {
  it('runs the callback after the delay, and a cancelled timer never runs', () => {
    vi.useFakeTimers();
    const ran: string[] = [];
    realScheduler.after(250, () => ran.push('kept'));
    const cancel = realScheduler.after(250, () => ran.push('cancelled'));
    cancel();
    vi.advanceTimersByTime(249);
    expect(ran).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ran).toEqual(['kept']);
  });
});
