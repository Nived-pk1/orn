/**
 * `withHandle` (step 4.3a): every RDKit object is freed in a `finally` on every path, through this one helper. Proved with a
 * fake module whose objects count their `delete()` calls: on success, on a throw, on an early return inside `use`, when `open`
 * finds nothing, and when several handles are nested.
 */
import { describe, expect, it } from 'vitest';
import { createFakeRdkit, ETHANOL_SPEC } from '@/test-support/fake-rdkit';
import { withHandle } from './scope';

const rdkit = () => createFakeRdkit({ CCO: ETHANOL_SPEC });

describe('withHandle', () => {
  it('frees on success and returns what `use` returned', () => {
    const fake = rdkit();
    const out = withHandle(() => fake.module.get_mol('CCO'), (mol) => mol.get_smiles());
    expect(out).toEqual({ opened: true, value: 'CCO' });
    expect(fake.handles.map((h) => h.deleted)).toEqual([1]);
  });

  it('frees on a throw, and the original error is the one that propagates', () => {
    const fake = rdkit();
    const boom = new Error('boom');
    expect(() =>
      withHandle(() => fake.module.get_mol('CCO'), () => {
        throw boom;
      }),
    ).toThrow(boom);
    expect(fake.leaked()).toEqual([]);
  });

  it('frees on an early return inside `use`', () => {
    const fake = rdkit();
    const use = (early: boolean) => withHandle(() => fake.module.get_mol('CCO'), (mol) => {
      if (early) return 'early';
      mol.get_smiles();
      return 'late';
    });
    expect(use(true)).toEqual({ opened: true, value: 'early' });
    expect(use(false)).toEqual({ opened: true, value: 'late' });
    expect(fake.handles.map((h) => h.deleted)).toEqual([1, 1]);
  });

  it('opens nothing and frees nothing when RDKit returns null; `use` never runs', () => {
    const fake = rdkit();
    let ran = false;
    const out = withHandle(() => fake.module.get_mol('not a structure'), () => {
      ran = true;
    });
    expect(out).toEqual({ opened: false });
    expect(ran).toBe(false);
    expect(fake.handles).toEqual([]);
  });

  it('when `open` itself throws there is nothing to free and the exception passes through', () => {
    const fake = createFakeRdkit({ bad: new Error('parser exploded') });
    expect(() => withHandle(() => fake.module.get_mol('bad'), () => 1)).toThrow('parser exploded');
    expect(fake.handles).toEqual([]);
  });

  it('frees nested handles inner first, each exactly once, also when the inner `use` throws', () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC }, { '[OX2H]': { ok: true } });
    const order: string[] = [];
    const run = (fail: boolean) =>
      withHandle(() => fake.module.get_mol('CCO'), (mol) =>
        withHandle(() => fake.module.get_qmol('[OX2H]'), (query) => {
          mol.get_substruct_match(query);
          order.push('used');
          if (fail) throw new Error('inner');
        }),
      );
    run(false);
    expect(() => run(true)).toThrow('inner');
    expect(order).toEqual(['used', 'used']);
    expect(fake.handles.map((h) => `${h.kind}:${h.deleted}`)).toEqual(['mol:1', 'qmol:1', 'mol:1', 'qmol:1']);
  });

  it('does not free an object `use` already freed (isDeleted is honoured)', () => {
    const fake = rdkit();
    withHandle(() => fake.module.get_mol('CCO'), (mol) => mol.delete());
    expect(fake.handles.map((h) => h.deleted)).toEqual([1]);
  });

  it('a `delete()` that fails on a normal path is NOT hidden (a leak must be seen)', () => {
    const leaky = { delete: () => { throw new Error('delete failed'); }, isDeleted: () => false };
    expect(() => withHandle(() => leaky, () => 'value')).toThrow('delete failed');
  });

  it('a `delete()` that fails while another error is propagating does not replace it (after a WASM trap delete may trap too)', () => {
    const leaky = { delete: () => { throw new Error('delete failed'); }, isDeleted: () => false };
    const original = new Error('the real problem');
    expect(() => withHandle(() => leaky, () => { throw original; })).toThrow(original);
  });
});
