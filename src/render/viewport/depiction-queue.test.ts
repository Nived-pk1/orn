import { describe, expect, it } from 'vitest';
import { createDepictionManager, DEPICTION_BUSY } from '@/render/svg';
import type { DepictionAnswer } from '@/render/svg';
import { manualTimers } from '@/test-support/viewport-kit';
import { BUSY_MAX_RETRIES, createDepictionQueue } from './depiction-queue';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function setup(answer: (key: string) => Promise<DepictionAnswer> = () => new Promise(() => undefined), maxPending = 3) {
  const timers = manualTimers();
  const asked: string[] = [];
  const manager = createDepictionManager({
    fetchSvg: (key) => {
      asked.push(key);
      return answer(key);
    },
    createUrl: (svg) => `blob:${svg}`,
    revokeUrl: () => undefined,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  const queue = createDepictionQueue({ source: manager, setTimer: timers.setTimer, clearTimer: timers.clearTimer, maxPending });
  return { timers, asked, manager, queue };
}

const keys = (n: number): string[] => Array.from({ length: n }, (_, i) => `k${i}`);

describe('depiction queue', () => {
  it('asks for nothing until the view has been still for 250 ms, and each move restarts the wait', () => {
    const { timers, asked, queue } = setup();
    queue.update(keys(2), 3);
    timers.advance(200);
    queue.update(keys(2), 3);
    timers.advance(200);
    expect(asked).toEqual([]);
    timers.advance(60);
    expect(asked).toEqual(['k0', 'k1']);
  });

  it('is bounded: never more requests in flight than the limit; the rest wait for a free slot', async () => {
    const { timers, asked, queue } = setup((key) => Promise.resolve({ ok: true, svg: key }), 3);
    queue.update(keys(8), 3);
    timers.advance(250);
    expect(asked).toEqual(['k0', 'k1', 'k2']);
    expect(queue.pending().length).toBeLessThanOrEqual(3);
    for (let i = 0; i < 4; i++) {
      await settle();
      timers.advance(250);
      expect(queue.pending().length).toBeLessThanOrEqual(3);
    }
    expect(asked).toEqual(keys(8));
  });

  it('cancels what left the viewport, and everything below LOD 3', () => {
    const { timers, asked, manager, queue } = setup(undefined, 5);
    queue.update(['a', 'b', 'c'], 3);
    timers.advance(250);
    expect(asked).toEqual(['a', 'b', 'c']);
    queue.update(['c', 'd'], 3);
    timers.advance(250);
    expect(manager.snapshot('a').state).toBe('idle');
    expect(manager.snapshot('b').state).toBe('idle');
    expect(manager.snapshot('c').state).toBe('loading');
    expect(asked).toEqual(['a', 'b', 'c', 'd']);
    queue.update(['c', 'd'], 2);
    expect(manager.snapshot('c').state).toBe('idle');
    expect(queue.pending()).toEqual([]);
  });

  it('retries a busy service and never shows "unavailable"', async () => {
    let busy = true;
    const { timers, asked, manager, queue } = setup(() => Promise.resolve(busy ? { ok: false, reason: DEPICTION_BUSY } : { ok: true, svg: 'x' }));
    queue.update(['a'], 3);
    timers.advance(250);
    await settle();
    expect(manager.snapshot('a').state).toBe('idle');
    busy = false;
    timers.advance(500);
    await settle();
    expect(manager.snapshot('a')).toEqual({ state: 'ready', url: 'blob:x' });
    expect(asked).toEqual(['a', 'a']);
  });

  it('gives up after the retry bound while the service stays busy, still without unavailable', async () => {
    const { timers, asked, manager, queue } = setup(() => Promise.resolve({ ok: false, reason: DEPICTION_BUSY }));
    queue.update(['a'], 3);
    timers.advance(250);
    for (let i = 0; i < BUSY_MAX_RETRIES + 5; i++) {
      await settle();
      timers.advance(500);
    }
    expect(asked.length).toBeLessThanOrEqual(BUSY_MAX_RETRIES + 2);
    expect(manager.snapshot('a').state).not.toBe('unavailable');
  });

  it('does not ask again for a ready or unavailable key, and stops at dispose', async () => {
    const { timers, asked, queue } = setup((key) => Promise.resolve(key === 'bad' ? { ok: false, reason: 'no_structure' } : { ok: true, svg: key }));
    queue.update(['ok', 'bad'], 3);
    timers.advance(250);
    await settle();
    queue.update(['ok', 'bad'], 3);
    timers.advance(250);
    expect(asked).toEqual(['ok', 'bad']);
    queue.dispose();
    queue.update(['z'], 3);
    timers.advance(1000);
    expect(asked).toEqual(['ok', 'bad']);
  });
});
