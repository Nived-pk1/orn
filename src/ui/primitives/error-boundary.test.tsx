// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';

afterEach(cleanup);

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <p>fine now</p>;
}

describe('ErrorBoundary', () => {
  it('says what happened in plain words at once, with a native Reload that tries the panel again (step 8.4g, G7)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: unknown[] = [];
    shouldThrow = true;
    render(
      <ErrorBoundary label="The test panel" onError={(error) => seen.push(error)}>
        <Bomb />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole('alert', { name: 'The test panel' });
    expect(alert.textContent).toContain('Something went wrong on this screen. Your saved data is safe.');
    expect(seen).toHaveLength(1);
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(screen.getByText('fine now')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the full screen when its chunk has loaded: the detail folded under Details, and Back up now when the app gives a way', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    shouldThrow = true;
    const backUp = vi.fn();
    render(
      <ErrorBoundary label="The dataset panel" backUp={backUp}>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }));
    expect(backUp).toHaveBeenCalledTimes(1);
    const details = screen.getByRole('alert', { name: 'The dataset panel' }).querySelector('details');
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('The dataset panel: Error: boom');
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(screen.getByText('fine now')).toBeTruthy();
  });

  it('keeps the plain fallback when the full screen cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock('./error-screen', () => {
      throw new Error('chunk failed');
    });
    vi.resetModules();
    const { ErrorBoundary: Fresh } = await import('./error-boundary');
    shouldThrow = true;
    render(
      <Fresh label="p">
        <Bomb />
      </Fresh>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('alert').textContent).toContain('Your saved data is safe.');
    expect(screen.queryByText('Details')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    vi.doUnmock('./error-screen');
  });

  it.each(['Failed to fetch dynamically imported module: https://x.test/a.js', 'error loading dynamically imported module', 'Importing a module script failed.', 'Load failed'])(
    'a screen whose code could not be loaded (a new deploy while the page is open) reloads the page, as Chromium, Firefox and WebKit say it: "%s"',
    (words) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const reload = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload });
      function Gone(): never {
        throw new TypeError(words);
      }
      render(
        <ErrorBoundary label="p">
          <Gone />
        </ErrorBoundary>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(reload).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    },
  );

  it('renders its children untouched when nothing fails', () => {
    shouldThrow = false;
    render(
      <ErrorBoundary label="p">
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine now')).toBeTruthy();
  });

  it('a non-Error throw is shown as text too (in the Details of the full screen)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Odd(): never {
      throw 'a plain string';
    }
    render(
      <ErrorBoundary label="p">
        <Odd />
      </ErrorBoundary>,
    );
    await screen.findByText('Details');
    expect(screen.getByRole('alert').textContent).toContain('a plain string');
  });
});
