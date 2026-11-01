// @vitest-environment jsdom
/** The line a lazy view shows while its chunk loads (7.6 A4): words, role status, and it is gone when the view arrives. */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { lazy, Suspense, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingLine } from './loading-line';

afterEach(cleanup);

describe('LoadingLine', () => {
  it('says "Loading…" as a status while a lazy view loads, then the view replaces it', async () => {
    let arrive: (() => void) | undefined;
    const Lazy = lazy(() => new Promise<{ default: () => ReactElement }>((resolve) => (arrive = () => resolve({ default: () => <p>The view</p> }))));
    render(
      <Suspense fallback={<LoadingLine />}>
        <Lazy />
      </Suspense>,
    );
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    arrive?.();
    await waitFor(() => expect(screen.getByText('The view')).toBeTruthy());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
