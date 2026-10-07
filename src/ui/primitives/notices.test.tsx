// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Banner, NOTICE_WORD } from './banner';
import { Skeleton } from './skeleton';
import { MAX_TOASTS, ToastProvider, useToasts, type Toasts } from './toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Banner', () => {
  it.each(['info', 'warning', 'error', 'review'] as const)('%s: says its kind in words and shows its text and actions', (kind) => {
    render(<Banner kind={kind} actions={<button type="button">Retry</button>}>Something happened</Banner>);
    expect(screen.getByText(NOTICE_WORD[kind])).toBeTruthy();
    expect(screen.getByText('Something happened')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('only an error is an alert; the others are plain text in whatever live region holds them', () => {
    const { rerender } = render(<Banner kind="error">Bad</Banner>);
    expect(screen.getByRole('alert').textContent).toContain('Bad');
    rerender(<Banner kind="warning">Careful</Banner>);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Skeleton', () => {
  it('is a busy status named by its label; the bars are hidden from assistive technology; the count is bounded', () => {
    const { container, rerender } = render(<Skeleton label="Starting up" lines={4} />);
    const status = screen.getByRole('status', { name: 'Starting up' });
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
    rerender(<Skeleton label="Starting up" lines={50} />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(8);
    rerender(<Skeleton label="Starting up" lines={0} />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });
});

describe('Toast', () => {
  let api: Toasts;
  function Capture() {
    api = useToasts();
    return null;
  }
  beforeEach(() => {
    render(
      <ToastProvider>
        <Capture />
      </ToastProvider>,
    );
  });

  it('the live region is mounted, polite and empty before any toast, so the first toast is announced', () => {
    const region = screen.getByRole('status', { name: 'Notifications' });
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
  });

  it('a pushed toast appears inside the live region and Dismiss removes it', () => {
    act(() => void api.push({ text: 'Imported 3 records.' }));
    const region = screen.getByRole('status', { name: 'Notifications' });
    expect(within(region).getByText('Imported 3 records.')).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Dismiss' }));
    expect(within(region).queryByText('Imported 3 records.')).toBeNull();
  });

  it('autoDismissMs removes it after that long and not before', () => {
    vi.useFakeTimers();
    act(() => void api.push({ text: 'Saved', autoDismissMs: 5_000 }));
    act(() => void vi.advanceTimersByTime(4_999));
    expect(screen.getByText('Saved')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('a toast without autoDismissMs stays', () => {
    vi.useFakeTimers();
    act(() => void api.push({ text: 'Stays' }));
    act(() => void vi.advanceTimersByTime(600_000));
    expect(screen.getByText('Stays')).toBeTruthy();
  });

  it(`at most ${MAX_TOASTS} show at once: a newer toast pushes the oldest out`, () => {
    act(() => {
      for (let i = 1; i <= MAX_TOASTS + 2; i += 1) api.push({ text: `toast ${i}` });
    });
    const region = screen.getByRole('status', { name: 'Notifications' });
    expect(within(region).getAllByRole('button', { name: 'Dismiss' })).toHaveLength(MAX_TOASTS);
    expect(within(region).queryByText('toast 1')).toBeNull();
    expect(within(region).getByText(`toast ${MAX_TOASTS + 2}`)).toBeTruthy();
  });

  it('useToasts outside a provider is a programmer error', () => {
    cleanup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Capture />)).toThrow(/outside a ToastProvider/);
    spy.mockRestore();
  });
});
