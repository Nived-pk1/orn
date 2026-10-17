// @vitest-environment jsdom
/** The palette is a lazy chunk (step 6.1a, gate-e-packet 8.1): nothing until asked or prefetched, a Skeleton while it loads, words and Retry on failure. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createChunkCache } from '@/app/services/lazy-chunk';
import { stubDialog } from '@/test-support/window-kit';
import { LazyPalette, prefetchPalette } from './lazy-palette';

beforeAll(stubDialog);
afterEach(cleanup);

const ports = {} as never;
function Fake(props: { readonly open: boolean; readonly onClose: () => void }) {
  return props.open ? <p>the palette</p> : null;
}

describe('LazyPalette', () => {
  it('while closed and not prefetched it loads nothing', () => {
    const load = vi.fn(() => Promise.resolve(Fake as never));
    render(<LazyPalette ports={ports} open={false} onClose={() => undefined} chunk={createChunkCache(load, 'Search')} />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });

  it('opening shows the Skeleton in a Search dialog, then the palette', async () => {
    let release: (value: never) => void = () => undefined;
    const chunk = createChunkCache(() => new Promise<never>((resolve) => (release = resolve)), 'Search');
    render(<LazyPalette ports={ports} open onClose={() => undefined} chunk={chunk} />);
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Loading search' })).toBeTruthy();
    await act(async () => release(Fake as never));
    expect(screen.getByText('the palette')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading search' })).toBeNull();
  });

  it('a prefetched chunk opens at once, with no Skeleton', async () => {
    const chunk = createChunkCache(() => Promise.resolve(Fake as never), 'Search');
    await prefetchPalette(chunk);
    render(<LazyPalette ports={ports} open onClose={() => undefined} chunk={chunk} />);
    expect(screen.getByText('the palette')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a failed chunk says so in words with Retry, and Retry loads it', async () => {
    let fail = true;
    const chunk = createChunkCache(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(Fake as never)), 'Search');
    const onClose = vi.fn();
    render(<LazyPalette ports={ports} open onClose={onClose} chunk={chunk} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Search could not be loaded (offline)');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('the palette')).toBeTruthy();
  });
});
