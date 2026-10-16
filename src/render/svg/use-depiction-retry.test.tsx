// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDepictionManager, DEPICTION_BUSY, type DepictionAnswer } from './depictions';
import { manualTimers } from '@/test-support/navigator-kit';
import { MAX_DEPICTION_RETRIES, RETRY_DELAY_MS, useRetryingDepiction as useDepiction } from './use-depiction-retry';

afterEach(cleanup);

function rig(answer: (key: string) => Promise<DepictionAnswer> = () => Promise.resolve({ ok: true, svg: '<svg/>' })) {
  const timers = manualTimers();
  const calls: string[] = [];
  const cancelled: string[] = [];
  const inner = createDepictionManager({
    fetchSvg: (key) => (calls.push(key), answer(key)),
    createUrl: () => `blob:${calls.length}`,
    revokeUrl: () => undefined,
    setTimer: (cb, ms) => timers.after(ms, cb),
    clearTimer: (h) => (h as () => void)(),
  });
  const manager = { ...inner, cancel: (key: string) => (cancelled.push(key), inner.cancel(key)) };
  return { timers, calls, cancelled, manager };
}

type Rig = ReturnType<typeof rig>;

function Probe(props: { readonly rig: Rig; readonly id: string }) {
  const status = useDepiction(props.rig.manager, 'key-a', props.rig.timers);
  return <p data-testid={props.id}>{status.state === 'ready' ? status.url : status.state}</p>;
}

describe('useDepiction', () => {
  it('asks once on mount and shows the object URL', async () => {
    const r = rig();
    render(<Probe rig={r} id="one" />);
    expect((await screen.findByTestId('one')).textContent).toMatch(/^blob:/);
    expect(r.calls).toEqual(['key-a']);
  });

  it('asks nothing without a key and shows idle', () => {
    const r = rig();
    function NoKey() {
      return <p data-testid="none">{useDepiction(r.manager, undefined, r.timers).state}</p>;
    }
    render(<NoKey />);
    expect(screen.getByTestId('none').textContent).toBe('idle');
    expect(r.calls).toEqual([]);
  });

  it('two cards share one request; the key is cancelled only when the last one goes', () => {
    const r = rig(() => new Promise(() => undefined));
    const a = render(<Probe rig={r} id="a" />);
    const b = render(<Probe rig={r} id="b" />);
    expect(r.calls).toEqual(['key-a']);
    a.unmount();
    expect(r.cancelled).toEqual([]);
    b.unmount();
    expect(r.cancelled).toEqual(['key-a']);
  });

  it('a busy answer is asked again a bounded number of times, a little later each time, and never shown as unavailable', async () => {
    const r = rig(() => Promise.resolve({ ok: false, reason: DEPICTION_BUSY }));
    render(<Probe rig={r} id="busy" />);
    await act(async () => void (await Promise.resolve()));
    expect(r.calls).toHaveLength(1);
    for (let attempt = 1; attempt <= MAX_DEPICTION_RETRIES + 2; attempt += 1) {
      await act(async () => {
        r.timers.advance(RETRY_DELAY_MS * attempt);
        await Promise.resolve();
      });
    }
    expect(r.calls).toHaveLength(1 + MAX_DEPICTION_RETRIES);
    expect(screen.getByTestId('busy').textContent).toBe('idle');
  });

  it('an unavailable structure is not asked again', async () => {
    const r = rig(() => Promise.resolve({ ok: false, reason: 'invalid' }));
    render(<Probe rig={r} id="bad" />);
    expect((await screen.findByTestId('bad')).textContent).toBe('unavailable');
    await act(async () => r.timers.advance(10_000));
    expect(r.calls).toHaveLength(1);
  });
});

describe('useDepiction when the engine is not ready yet (phone mode B, part 1)', () => {
  function pendingRig(answer: () => Promise<DepictionAnswer>) {
    const timers = manualTimers();
    const calls: string[] = [];
    let pending = true;
    const manager = createDepictionManager({
      fetchSvg: (key) => (calls.push(key), answer()),
      createUrl: () => `blob:${calls.length}`,
      revokeUrl: () => undefined,
      setTimer: (cb, ms) => timers.after(ms, cb),
      clearTimer: (h) => (h as () => void)(),
      isPending: () => pending,
    });
    return { timers, calls, manager, ready: () => ((pending = false), manager.forgetNotReady()) };
  }
  const Card = (props: { readonly r: ReturnType<typeof pendingRig>; readonly id: string }) => {
    const status = useDepiction(props.r.manager, 'key-a', props.r.timers);
    return <p data-testid={props.id}>{status.state === 'ready' ? 'drawn' : status.state}</p>;
  };

  it('every card that shows a key that failed too early asks again once when the engine is ready, and then shows the drawing', async () => {
    let fail = true;
    const r = pendingRig(() => Promise.resolve(fail ? { ok: false, reason: 'unavailable' } : { ok: true, svg: '<svg/>' }));
    render(
      <>
        <Card r={r} id="one" />
        <Card r={r} id="two" />
      </>,
    );
    expect((await screen.findByTestId('one')).textContent).toBe('unavailable');
    expect(r.calls).toHaveLength(1);
    fail = false;
    await act(async () => void r.ready());
    await act(async () => {
      r.timers.advance(RETRY_DELAY_MS);
      await Promise.resolve();
    });
    expect((await screen.findByTestId('one')).textContent).toBe('drawn');
    expect(screen.getByTestId('two').textContent).toBe('drawn');
    expect(r.calls).toHaveLength(2); // one more request, shared by both cards
  });

  it('a key that failed for another reason is not asked again when the engine becomes ready', async () => {
    const r = pendingRig(() => Promise.resolve({ ok: false, reason: 'invalid' }));
    r.ready(); // the engine is ready before the failure
    render(<Card r={r} id="bad" />);
    expect((await screen.findByTestId('bad')).textContent).toBe('unavailable');
    await act(async () => {
      r.ready();
      r.timers.advance(10_000);
      await Promise.resolve();
    });
    expect(screen.getByTestId('bad').textContent).toBe('unavailable');
    expect(r.calls).toHaveLength(1);
  });
});
