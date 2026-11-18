// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { StarredView } from './starred-view';
import { createMyRecords } from './my-records';

afterEach(cleanup);
const state = {
  records: {
    species: { s1: { id: 's1', names: { display: 'Ethanol' }, aliases: [] } },
    reaction: { r1: { id: 'r1', names: { display: 'Aldol addition' }, aliases: [] } },
  },
} as unknown as CanonicalState;
const ref = (kind: string, id: string) => ({ kind, id }) as RecordRef;
const mineWith = (starred: RecordRef[]) => createMyRecords({ bootReport: { uiState: { starred } } } as never);

describe('StarredView (step 8.4g Part B, G2)', () => {
  it('lists the starred records grouped by kind; a row opens its record', () => {
    const open = vi.fn();
    render(<StarredView state={state} mine={mineWith([ref('species', 's1'), ref('reaction', 'r1')])} onOpen={open} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Starred' })).toBeTruthy();
    const reactions = screen.getByRole('region', { name: 'Reactions' });
    fireEvent.click(within(reactions).getByRole('button', { name: /Aldol addition/ }));
    expect(open).toHaveBeenCalledWith(ref('reaction', 'r1'), 'Aldol addition');
    expect(screen.getByRole('region', { name: 'Compounds' })).toBeTruthy();
  });

  it('says what to do when nothing is starred', () => {
    render(<StarredView state={state} mine={mineWith([])} onOpen={() => undefined} />);
    expect(screen.getByText('Nothing starred yet. Press the star on any reaction or compound to keep it here.')).toBeTruthy();
  });

  it('counts the stars whose record no longer exists in the footer', () => {
    render(<StarredView state={state} mine={mineWith([ref('species', 's1'), ref('species', 'gone'), ref('reaction', 'gone2')])} onOpen={() => undefined} />);
    expect(screen.getByText('2 starred records no longer exist')).toBeTruthy();
    expect(screen.queryByText('gone')).toBeNull();
  });

  it('follows a star taken away', () => {
    const mine = mineWith([ref('species', 's1')]);
    render(<StarredView state={state} mine={mine} onOpen={() => undefined} />);
    expect(screen.getByRole('region', { name: 'Compounds' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ethanol/ })); // opens; then the star is removed elsewhere
    mine.toggle(ref('species', 's1'));
    return Promise.resolve().then(() => expect(screen.queryByRole('region', { name: 'Compounds' })).toBeNull());
  });
});
