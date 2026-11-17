import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '../schema';
import { createRowFinder } from './review-find';
import type { QueueRow } from './review-queue';

const row = (kind: string, id: string): QueueRow => ({ ref: { kind, id } as QueueRow['ref'], name: id, kindWords: kind, status: 'unreviewed', statusWords: '', reasons: [], errors: 0, warnings: 0, firstError: undefined, firstWarning: undefined, origin: 'import', tags: [], updatedAt: '2026-01-01T00:00:00.000Z' });

function stateOf(records: Record<string, Record<string, unknown>>): CanonicalState {
  return { records: { species: {}, reaction: {}, class: {}, reagent: {}, ...records } } as unknown as CanonicalState;
}

describe('createRowFinder (step 8.4g, G8)', () => {
  const state = stateOf({
    species: {
      spc_1: { kind: 'species', id: 'spc_1', names: { canonical: 'Ethanol', aliases: ['Ethyl alcohol'], common: ['Grain alcohol'] }, formulaText: 'C2H5OH' },
      spc_2: { kind: 'species', id: 'spc_2', names: { canonical: 'Acétone', aliases: [] } },
    },
    reaction: { rxn_1: { kind: 'reaction', id: 'rxn_1', name: 'Aldol condensation', aliases: ['Aldol'] } },
  });
  const rows = [row('species', 'spc_1'), row('species', 'spc_2'), row('reaction', 'rxn_1')];
  const find = createRowFinder(state, rows);

  it('returns every row for an empty box', () => {
    expect(find('')).toBe(rows);
    expect(find('   ')).toBe(rows);
  });

  it('finds by name, other name and formula, ignoring case and accents', () => {
    expect(find('ethanol').map((r) => r.ref.id)).toEqual(['spc_1']);
    expect(find('ETHYL ALC').map((r) => r.ref.id)).toEqual(['spc_1']);
    expect(find('grain').map((r) => r.ref.id)).toEqual(['spc_1']);
    expect(find('c2h5oh').map((r) => r.ref.id)).toEqual(['spc_1']);
    expect(find('acetone').map((r) => r.ref.id)).toEqual(['spc_2']);
    expect(find('aldol').map((r) => r.ref.id)).toEqual(['rxn_1']);
  });

  it('finds nothing for a text no record has, and keeps the order of the rows', () => {
    expect(find('zzz')).toEqual([]);
    expect(find('l').map((r) => r.ref.id)).toEqual(['spc_1', 'rxn_1']);
  });

  it('a record that is gone matches nothing but never throws', () => {
    expect(createRowFinder(stateOf({}), [row('species', 'gone')])('x')).toEqual([]);
  });

  it('is fast with thousands of rows', () => {
    const many: Record<string, unknown> = {};
    const manyRows: QueueRow[] = [];
    for (let i = 0; i < 4836; i += 1) {
      many[`spc_${i}`] = { kind: 'species', id: `spc_${i}`, names: { canonical: `Compound number ${i}`, aliases: [`alias ${i}`] }, formulaText: `C${i}H2` };
      manyRows.push(row('species', `spc_${i}`));
    }
    const big = createRowFinder(stateOf({ species: many }), manyRows);
    const started = performance.now();
    expect(big('number 4835').map((r) => r.ref.id)).toEqual(['spc_4835']);
    for (const text of ['n', 'nu', 'num', 'numb']) big(text);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
