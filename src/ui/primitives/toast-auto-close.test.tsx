// @vitest-environment jsdom
/** Result toasts close by themselves (step 6.5a): the countdown pauses under the pointer and while focus is inside; an action or a warning given no time stays. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RESULT_TOAST_MS, ToastProvider, useToasts, type ToastTimers, type Toasts } from './toast';

afterEach(cleanup);

/** Fake timers we drive by hand: `advance(ms)` runs what is due. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  const timers: ToastTimers = {
    set: (run, ms) => {
      const handle = next++;
      pending.set(handle, { at: now + ms, run });
      return handle;
    },
    clear: (handle) => void pending.delete(handle as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [handle, timer] of [...pending]) {
      if (timer.at <= now) {
        pending.delete(handle);
        timer.run();
      }
    }
  };
  return { timers, advance };
}

let api: Toasts;
function Probe() {
  api = useToasts();
  return null;
}
function setup() {
  const clock = fakeTimers();
  render(
    <ToastProvider timers={clock.timers}>
      <Probe />
    </ToastProvider>,
  );
  return clock;
}

describe('result toasts', () => {
  it('RESULT_TOAST_MS is 6 seconds', () => {
    expect(RESULT_TOAST_MS).toBe(6_000);
  });

  it('closes after its time and not before', () => {
    const clock = setup();
    act(() => void api.push({ text: 'Saved', autoDismissMs: RESULT_TOAST_MS }));
    act(() => clock.advance(5_999));
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => clock.advance(1));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('the countdown waits while the pointer is over the toast and starts again when it leaves', () => {
    const clock = setup();
    act(() => void api.push({ text: 'Saved', autoDismissMs: RESULT_TOAST_MS }));
    const toast = screen.getByText('Saved').closest('div')?.parentElement as HTMLElement;
    fireEvent.pointerEnter(toast);
    act(() => clock.advance(60_000));
    expect(screen.getByText('Saved')).toBeTruthy();
    fireEvent.pointerLeave(toast);
    act(() => clock.advance(RESULT_TOAST_MS));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('the countdown waits while focus is inside the toast', () => {
    const clock = setup();
    act(() => void api.push({ text: 'Saved', autoDismissMs: RESULT_TOAST_MS }));
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    act(() => dismiss.focus());
    act(() => clock.advance(60_000));
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => dismiss.blur());
    act(() => clock.advance(RESULT_TOAST_MS));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('a toast with an action, given no time, stays', () => {
    const clock = setup();
    act(() => void api.push({ text: 'Imported', action: { label: 'Undo import', onAction: () => undefined } }));
    act(() => clock.advance(600_000));
    expect(screen.getByText('Imported')).toBeTruthy();
  });
});
