// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { reaction, sp, species } from '@/test-support/graph-state';
import { setup } from '@/test-support/precursors-view-kit';

afterEach(cleanup);

describe('Continue from here (step C6)', () => {
  const names = ['src', 's0', 's1', 's2', 's3', 's4', 's5'];
  const sixLevels = (): CanonicalState => {
    const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
    const records = [
      ...names.map((n) => species(n, n)),
      ...names.slice(0, -1).map((n, i) => reaction({ slug: `l-${n}`, name: `l-${n}`, scope: 'specific', participants: [{ ref: sp(n), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp(names[i + 1] as string) }] }] })),
    ];
    for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
    return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
  };
  it('a compound on level 5 with makers starts a new search with itself as the target, in ONE history entry', async () => {
    const push = vi.spyOn(history, 'pushState');
    const { precursors, asked } = setup({ target: { kind: 'species', id: 'spc_s5' } }, { state: sixLevels() });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const button = await screen.findByRole('button', { name: 'Continue from s0' });
    expect(screen.getAllByRole('button', { name: 'Continue from s0' })).toHaveLength(1);
    fireEvent.click(button);
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(precursors.getState().target).toEqual({ kind: 'species', id: 'spc_s0' });
    expect(asked[1]).toMatchObject({ target: { kind: 'species', id: 'spc_s0' } });
    expect(push).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/steps from src|step from src/)).toBeTruthy();
    push.mockRestore();
  });
  it('Back (popstate with the previous target) returns to the previous search', async () => {
    const { precursors, asked } = setup({ target: { kind: 'species', id: 'spc_s5' } }, { state: sixLevels() });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue from s0' }));
    await waitFor(() => expect(asked).toHaveLength(2));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { orn: 'precursor-target', target: { kind: 'species', id: 'spc_s5' } } }));
    });
    await waitFor(() => expect(asked).toHaveLength(3));
    expect(precursors.getState().target).toEqual({ kind: 'species', id: 'spc_s5' });
  });
});
