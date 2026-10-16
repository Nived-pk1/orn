// @vitest-environment jsdom
/** Toasts on a phone (ADR-039, phone mode B part 2): folded, nothing floats; the toasts are listed where the app puts `ToastItems` and still announced. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastItems, ToastProvider, useToastView, useToasts, type Toasts } from './toast';

afterEach(cleanup);

let api: Toasts;
function Probe() {
  api = useToasts();
  const view = useToastView();
  return (
    <section aria-label="Notices line">
      <p data-testid="count">{view?.items.length ?? -1}</p>
      <ToastItems />
    </section>
  );
}

describe('ToastProvider folded', () => {
  it('has no floating region; a hidden live region is mounted from the start and announces each addition', () => {
    render(
      <ToastProvider folded>
        <Probe />
      </ToastProvider>,
    );
    const live = screen.getByRole('status', { name: 'Notifications' });
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    act(() => void api.push({ text: 'Imported 3 records.' }));
    expect(live.textContent).toBe('Imported 3 records.');
    expect(live.querySelector('button')).toBeNull(); // the text only: the buttons are in the notices line
  });

  it('the toasts are counted for the notices line and listed there, with their action and Dismiss', () => {
    const done: string[] = [];
    render(
      <ToastProvider folded>
        <Probe />
      </ToastProvider>,
    );
    expect(screen.getByTestId('count').textContent).toBe('0');
    act(() => void api.push({ text: 'Imported 3 records.', action: { label: 'Undo import', onAction: () => done.push('undo') } }));
    expect(screen.getByTestId('count').textContent).toBe('1');
    const line = within(screen.getByRole('region', { name: 'Notices line' }));
    expect(line.getByText('Imported 3 records.')).toBeTruthy();
    fireEvent.click(line.getByRole('button', { name: 'Undo import' }));
    expect(done).toEqual(['undo']);
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('not folded (the default) the toasts float in the one live region as before', () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    act(() => void api.push({ text: 'Floating.' }));
    const region = screen.getByRole('status', { name: 'Notifications' });
    expect(within(region).getByText('Floating.')).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });
});
