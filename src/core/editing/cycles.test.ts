/** The cycle guards a picker asks before Save (step 6.2b, decisions D1 and D3): same answers as HIER-001 and HIER-003, asked early. */
import { describe, expect, it } from 'vitest';
import { indexEngine } from '../indexes';
import type { CanonicalState, Reagent } from '../schema';
import { clsId, reagent, rg, rgtId, sp } from '@/test-support/demo/kit';
import { demoState } from '@/test-support/app-boot-kit';
import { SUBSTANCE_RULES } from '../validation/rules/substances';
import { classParentGuard, MAX_COMPOSITION_WALK, reagentComponentGuard } from './cycles';

const withReagents = (state: CanonicalState, ...extra: Reagent[]): CanonicalState =>
  ({ ...state, records: { ...state.records, reagent: { ...state.records.reagent, ...Object.fromEntries(extra.map((r) => [r.id, r])) } } }) as CanonicalState;

describe('classParentGuard', () => {
  const indexes = indexEngine.build(demoState());
  it('refuses the class itself and every class below it, with the reason', () => {
    const guard = classParentGuard(indexes, clsId('alcohols'));
    expect(guard(clsId('alcohols'))).toBe('self');
    expect(guard(clsId('alcohols-primary'))).toBe('below');
  });
  it('allows a class that is above, beside or unrelated', () => {
    const guard = classParentGuard(indexes, clsId('alcohols-primary'));
    expect(guard(clsId('alcohols'))).toBeUndefined();
    expect(guard(clsId('alcohols-secondary'))).toBeUndefined();
    expect(guard(clsId('ethers'))).toBeUndefined();
  });
  it('a class that is not stored (a new draft) refuses only itself', () => {
    const guard = classParentGuard(indexes, 'cls_brand-new');
    expect(guard('cls_brand-new')).toBe('self');
    expect(guard(clsId('alcohols'))).toBeUndefined();
  });
  it('agrees with HIER-001 on every pair of the demo classes', () => {
    const state = demoState();
    const ids = Object.keys(state.records.class);
    const hier = SUBSTANCE_RULES.find((r) => r.id === 'HIER-001');
    expect(hier).toBeDefined();
    for (const owner of ids.slice(0, 12)) {
      const guard = classParentGuard(indexes, owner);
      for (const candidate of ids) {
        const cyclic = candidate === owner || indexes.ancestorsOf('class', candidate).includes(owner);
        expect(guard(candidate) !== undefined).toBe(cyclic);
      }
    }
  });
});

describe('reagentComponentGuard', () => {
  const a = reagent('cyc-a', 'Cycle A', { families: ['catalyst'], components: [{ ref: rg('cyc-b'), role: 'active' }] });
  const b = reagent('cyc-b', 'Cycle B', { families: ['catalyst'], components: [{ ref: rg('cyc-c'), role: 'active' }, { ref: sp('ethanol'), role: 'solvent' }] });
  const c = reagent('cyc-c', 'Cycle C', { families: ['catalyst'] });
  const indexes = indexEngine.build(withReagents(demoState(), a, b, c));
  it('refuses the reagent itself and every reagent built from it, directly or through others', () => {
    const guard = reagentComponentGuard(indexes, rgtId('cyc-c'));
    expect(guard(rgtId('cyc-c'))).toBe('self');
    expect(guard(rgtId('cyc-b'))).toBe('below'); // B has C as a component
    expect(guard(rgtId('cyc-a'))).toBe('below'); // A has B, B has C
  });
  it('allows a reagent that is only below it, and unrelated ones', () => {
    const guard = reagentComponentGuard(indexes, rgtId('cyc-a'));
    expect(guard(rgtId('cyc-c'))).toBeUndefined();
    expect(guard(rgtId('pcc'))).toBeUndefined();
  });
  it('a reagent that is not stored refuses only itself', () => {
    const guard = reagentComponentGuard(indexes, 'rgt_brand-new');
    expect(guard('rgt_brand-new')).toBe('self');
    expect(guard(rgtId('cyc-a'))).toBeUndefined();
  });
  it('says "unchecked" for every reagent when the walk reaches its bound (never a guess)', () => {
    const fake = {
      referrersOf: (id: string) => [{ owner: { kind: 'reagent' as const, id: `${id}x` }, path: 'components[0].ref' }],
    } as unknown as Parameters<typeof reagentComponentGuard>[0];
    const guard = reagentComponentGuard(fake, 'rgt_start');
    expect(guard('rgt_other')).toBe('unchecked');
    expect(MAX_COMPOSITION_WALK).toBe(10_000);
  });
});
