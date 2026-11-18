// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { ContinueStrip } from './continue-strip';
import { createMyRecords } from './my-records';

afterEach(cleanup);
const ref = (kind: string, id: string) => ({ kind, id }) as RecordRef;
const state = (n: number) =>
  ({ records: { species: Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, { id: `s${i}`, names: { display: `Compound ${i}` }, aliases: [] }])) } }) as unknown as CanonicalState;
const mine = (n: number) => createMyRecords({ bootReport: { uiState: { recent: Array.from({ length: n }, (_, i) => ref('species', `s${i}`)) } } } as never);

describe('ContinueStrip (step 8.4g Part B, G3)', () => {
  it('shows nothing when nothing was opened, or when every recent record is gone', () => {
    const { container } = render(<ContinueStrip state={state(3)} mine={mine(0)} onOpen={() => undefined} />);
    expect(container.textContent).toBe('');
    cleanup();
    const gone = render(<ContinueStrip state={state(0)} mine={mine(3)} onOpen={() => undefined} />);
    expect(gone.container.textContent).toBe('');
  });

  it('"Continue where you left off": at most five records, newest first; one opens its record', () => {
    const open = vi.fn();
    render(<ContinueStrip state={state(12)} mine={mine(12)} onOpen={open} />);
    const region = screen.getByRole('region', { name: 'Continue where you left off' });
    const buttons = within(region).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Compound 0', 'Compound 1', 'Compound 2', 'Compound 3', 'Compound 4']);
    fireEvent.click(buttons[1] as HTMLElement);
    expect(open).toHaveBeenCalledWith(ref('species', 's1'), 'Compound 1');
  });
});
