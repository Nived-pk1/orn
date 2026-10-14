import { describe, expect, it } from 'vitest';
import { createApplyPace, LONG_AFTER_MS, MIN_GAP_MS, type PaceClock, type PaceView } from './apply-pace';

/** A clock the test moves by hand; timers fire in time order. */
function manualClock() {
  let now = 0;
  let timers: { at: number; run: () => void; live: boolean }[] = [];
  const clock: PaceClock = {
    now: () => now,
    after(run, ms) {
      const timer = { at: now + ms, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
  };
  return {
    clock,
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.live && t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        due.live = false;
        now = due.at;
        due.run();
      }
      now = target;
      timers = timers.filter((t) => t.live);
    },
    pending: () => timers.filter((t) => t.live).length,
  };
}

function rig() {
  const time = manualClock();
  const views: { at: number; view: PaceView }[] = [];
  const pace = createApplyPace(time.clock, (view) => views.push({ at: time.clock.now(), view }));
  return { time, views, pace };
}

describe('apply pace (5.11b)', () => {
  it('shows nothing under 2 s, however often the writer reports', () => {
    const { time, views, pace } = rig();
    pace.start();
    for (let i = 1; i <= 15; i += 1) {
      pace.feed({ done: i * 10, total: 150 });
      time.advance(LONG_AFTER_MS / 16);
    }
    expect(views).toEqual([]);
    pace.finish();
    expect(views).toEqual([]);
    expect(time.pending()).toBe(0);
  });

  it('at 2 s the long wait starts and the newest count is shown at once', () => {
    const { time, views, pace } = rig();
    pace.start();
    pace.feed({ done: 40, total: 100 });
    time.advance(LONG_AFTER_MS - 1);
    expect(views).toEqual([]);
    time.advance(1);
    expect(views.map((v) => v.view)).toEqual([{ long: true, progress: null }, { long: true, progress: { done: 40, total: 100 } }]);
  });

  it('updates at most 4 times a second, and the newest value is shown on its turn (never later than the gap)', () => {
    const { time, views, pace } = rig();
    pace.start();
    time.advance(LONG_AFTER_MS);
    views.length = 0;
    for (let i = 1; i <= 100; i += 1) {
      time.advance(10);
      pace.feed({ done: i, total: 100 });
    }
    const shown = views.filter((v) => v.view.progress !== null);
    expect(shown.length).toBeLessThanOrEqual(Math.ceil(1000 / MIN_GAP_MS) + 1);
    for (let i = 1; i < shown.length; i += 1) expect((shown[i] as { at: number }).at - (shown[i - 1] as { at: number }).at).toBeGreaterThanOrEqual(MIN_GAP_MS);
    time.advance(MIN_GAP_MS);
    expect(views[views.length - 1]?.view.progress).toEqual({ done: 100, total: 100 });
  });

  it('a steady writer (a report every 600 ms) is seen at least once a second', () => {
    const { time, views, pace } = rig();
    pace.start();
    time.advance(LONG_AFTER_MS);
    views.length = 0;
    for (let i = 1; i <= 10; i += 1) {
      pace.feed({ done: i * 32, total: 320 });
      time.advance(600);
    }
    const times = views.filter((v) => v.view.progress !== null).map((v) => v.at);
    expect(times.length).toBe(10);
    for (let i = 1; i < times.length; i += 1) expect((times[i] as number) - (times[i - 1] as number)).toBeLessThanOrEqual(1000);
  });

  it('the count only rises: a retried write that starts again and a null from a new stage change nothing', () => {
    const { time, views, pace } = rig();
    pace.start();
    time.advance(LONG_AFTER_MS);
    pace.feed({ done: 64, total: 100 });
    time.advance(MIN_GAP_MS);
    pace.feed(null);
    pace.feed({ done: 32, total: 100 });
    pace.feed({ done: 64, total: 100 });
    time.advance(MIN_GAP_MS * 4);
    const counts = views.flatMap((v) => (v.view.progress === null ? [] : [v.view.progress.done]));
    expect(counts).toEqual([64]);
    pace.feed({ done: 96, total: 100 });
    time.advance(MIN_GAP_MS);
    expect(views[views.length - 1]?.view.progress?.done).toBe(96);
  });

  it('finish shows the final count at once (N equals M) and stops every timer', () => {
    const { time, views, pace } = rig();
    pace.start();
    time.advance(LONG_AFTER_MS);
    pace.feed({ done: 50, total: 100 });
    time.advance(10);
    pace.feed({ done: 100, total: 100 });
    pace.finish();
    expect(views[views.length - 1]?.view.progress).toEqual({ done: 100, total: 100 });
    expect(time.pending()).toBe(0);
    const count = views.length;
    time.advance(5000);
    expect(views).toHaveLength(count);
  });

  it('a new start forgets the last apply', () => {
    const { time, views, pace } = rig();
    pace.start();
    time.advance(LONG_AFTER_MS);
    pace.feed({ done: 90, total: 100 });
    pace.finish();
    views.length = 0;
    pace.start();
    time.advance(LONG_AFTER_MS - 1);
    expect(views).toEqual([]);
    time.advance(1);
    expect(views[0]?.view).toEqual({ long: true, progress: null });
  });
});
